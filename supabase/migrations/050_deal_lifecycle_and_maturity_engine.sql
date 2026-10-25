-- ============================================================================
-- 050: Deal Lifecycle Modernization, Rate Basis Architecture, Audited Extensions & Maturity Dual Confirmation
-- ============================================================================

-- 1. Extend public.deals with rate basis, calculation, repayment timing, and extension audit columns
alter table public.deals
  add column if not exists interest_rate_basis text default 'Monthly',
  add column if not exists interest_calculation text default 'Simple',
  add column if not exists principal_repayment_timing text default 'At Maturity',
  add column if not exists original_maturity_date date,
  add column if not exists extension_count int not null default 0,
  add column if not exists extensions_history jsonb not null default '[]'::jsonb;

-- Ensure constraints (ignore if already added)
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deals_interest_rate_basis_check') then
    alter table public.deals add constraint deals_interest_rate_basis_check
      check (interest_rate_basis in ('Monthly', 'Annual', 'Quarterly', 'Half-Yearly', 'Custom'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_interest_calculation_check') then
    alter table public.deals add constraint deals_interest_calculation_check
      check (interest_calculation in ('Simple', 'Compound', 'Reducing Balance', 'Custom'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_principal_repayment_timing_check') then
    alter table public.deals add constraint deals_principal_repayment_timing_check
      check (principal_repayment_timing in ('At Maturity', 'Periodically', 'Custom'));
  end if;
exception when others then
  -- In case constraints already exist or minor conflict
  null;
end $$;

-- 2. Enhanced Schedule Generation Function with Rate Basis and Extension awareness
create or replace function public.fn_generate_payment_schedule(p_deal_id bigint)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  d public.deals;
  v_periods_per_year int;
  v_period_interval interval;
  v_rate_per_period numeric;
  v_balance numeric;
  v_emi numeric;
  v_interest numeric;
  v_principal numeric;
  v_total_periods int;
  v_period_no int;
  v_inserted int := 0;
  v_dates date[];
  v_end_date date;
  v_years_active numeric;
  v_last_paid_date date;
  v_first_calc_date date;
  v_effective_principal numeric;
  v_has_historical boolean := false;
begin
  select * into d from public.deals where id = p_deal_id;
  if d.id is null then
    raise exception 'Deal % not found or not accessible', p_deal_id;
  end if;

  if d.payment_frequency in ('Irregular', 'Custom') then
    return 0;
  end if;

  v_end_date := d.maturity_date;
  if v_end_date is null then
    raise exception 'Deal % needs a maturity_date to generate a payment schedule', p_deal_id;
  end if;

  -- Check if there are existing settled payments / historical schedule rows
  select max(scheduled_date) into v_last_paid_date
  from public.payment_schedule
  where deal_id = p_deal_id and status not in ('UPCOMING', 'DUE_TODAY', 'OVERDUE');

  if v_last_paid_date is not null then
    v_has_historical := true;
  end if;

  -- Only remove still-pending rows (UPCOMING, DUE_TODAY, OVERDUE)
  -- Settled or historical rows are NEVER deleted
  delete from public.payment_schedule
  where deal_id = p_deal_id and status in ('UPCOMING', 'DUE_TODAY', 'OVERDUE');

  case d.payment_frequency
    when 'Monthly' then v_periods_per_year := 12; v_period_interval := interval '1 month';
    when 'Quarterly' then v_periods_per_year := 4; v_period_interval := interval '3 months';
    when 'Half-Yearly' then v_periods_per_year := 2; v_period_interval := interval '6 months';
    when 'Yearly' then v_periods_per_year := 1; v_period_interval := interval '12 months';
    when 'At Maturity' then v_periods_per_year := 1; v_period_interval := interval '1 year';
    else raise exception 'Unhandled payment_frequency % for deal %', d.payment_frequency, p_deal_id;
  end case;

  -- Rate calculation: support Monthly basis directly (e.g. 1.7% monthly => 1.7/100)
  if d.interest_rate_basis = 'Monthly' and d.monthly_roi is not null and d.monthly_roi > 0 then
    v_rate_per_period := (d.monthly_roi / 100.0) * (12.0 / v_periods_per_year);
  elsif d.annual_roi is not null and d.annual_roi > 0 then
    v_rate_per_period := (d.annual_roi / 100.0) / v_periods_per_year;
  elsif d.monthly_roi is not null and d.monthly_roi > 0 then
    v_rate_per_period := (d.monthly_roi / 100.0) * (12.0 / v_periods_per_year);
  else
    v_rate_per_period := 0;
  end if;

  -- Effective outstanding principal for future schedule
  v_effective_principal := coalesce(d.current_principal, d.invested_amount);
  v_balance := v_effective_principal;

  if d.payment_frequency = 'At Maturity' then
    v_dates := array[v_end_date];
  else
    if v_has_historical and v_last_paid_date >= d.start_date then
      v_first_calc_date := (v_last_paid_date + v_period_interval);
    else
      v_first_calc_date := coalesce(d.first_payment_date, d.start_date + v_period_interval);
    end if;

    if v_first_calc_date > v_end_date then
      v_dates := array[v_end_date];
    else
      select array_agg(gs::date order by gs) into v_dates
      from generate_series(
        v_first_calc_date::timestamp,
        v_end_date::timestamp,
        v_period_interval
      ) gs;

      if v_dates is null or array_length(v_dates, 1) = 0 then
        v_dates := array[v_end_date];
      elsif v_dates[array_length(v_dates, 1)] <> v_end_date then
        v_dates := v_dates || v_end_date;
      end if;
    end if;
  end if;

  v_total_periods := coalesce(array_length(v_dates, 1), 0);
  if v_total_periods = 0 then
    return 0;
  end if;

  if v_total_periods > 1200 then
    raise exception 'Deal % would generate % schedule rows - check start/maturity dates', p_deal_id, v_total_periods;
  end if;

  if d.payout_type = 'EMI' then
    if v_rate_per_period > 0 then
      v_emi := round(
        v_balance * v_rate_per_period * power(1 + v_rate_per_period, v_total_periods)
        / (power(1 + v_rate_per_period, v_total_periods) - 1), 2);
    else
      v_emi := round(v_balance / v_total_periods, 2);
    end if;
  end if;

  for v_period_no in 1 .. v_total_periods loop
    declare
      v_is_final boolean := (v_period_no = v_total_periods);
      v_date date := v_dates[v_period_no];
    begin
      case d.payout_type
        when 'Interest Only' then
          v_interest := round(v_effective_principal * v_rate_per_period, 2);
          v_principal := 0;
        when 'Principal at Maturity' then
          v_interest := round(v_effective_principal * v_rate_per_period, 2);
          v_principal := case when v_is_final then v_balance else 0 end;
        when 'Bullet' then
          v_interest := round(v_effective_principal * v_rate_per_period, 2);
          v_principal := case when v_is_final then v_balance else 0 end;
        when 'Interest at Maturity' then
          v_years_active := extract(epoch from (v_end_date::timestamp - d.start_date::timestamp)) / (365.0 * 86400);
          v_interest := case when v_is_final
            then round(v_effective_principal * coalesce(d.annual_roi, (coalesce(d.monthly_roi, 0) * 12)) / 100.0 * v_years_active, 2)
            else 0 end;
          v_principal := case when v_is_final then v_balance else 0 end;
        when 'EMI' then
          v_interest := round(v_balance * v_rate_per_period, 2);
          v_principal := least(v_balance, greatest(0, round(v_emi - v_interest, 2)));
          if v_is_final then
            v_principal := v_balance;
          end if;
        else
          v_principal := case when v_is_final then v_balance else round(v_effective_principal / v_total_periods, 2) end;
          v_interest := round(v_balance * v_rate_per_period, 2);
      end case;

      insert into public.payment_schedule
        (user_id, deal_id, scheduled_date, expected_interest, expected_principal, payment_type, grace_period_days)
      values (d.user_id, d.id, v_date, v_interest, v_principal, coalesce(d.payout_type, 'Principal at Maturity'), 3);

      v_balance := greatest(0, v_balance - v_principal);
      v_inserted := v_inserted + 1;
    end;
  end loop;

  update public.deals
  set next_payment_date = (
    select min(scheduled_date)
    from public.payment_schedule
    where deal_id = p_deal_id and status in ('UPCOMING', 'DUE_TODAY', 'OVERDUE')
  )
  where id = p_deal_id;

  return v_inserted;
end;
$$;

-- 3. Dedicated Extension RPC: fn_extend_deal
create or replace function public.fn_extend_deal(
  p_deal_id bigint,
  p_new_maturity_date date,
  p_reason text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deal public.deals;
  v_old_maturity date;
  v_months_added int;
  v_history_entry jsonb;
begin
  select * into v_deal from public.deals where id = p_deal_id and user_id = v_user_id;
  if v_deal.id is null then
    return jsonb_build_object('ok', false, 'error', 'Deal not found or access denied');
  end if;

  if p_new_maturity_date <= v_deal.maturity_date then
    return jsonb_build_object('ok', false, 'error', 'New maturity date must be after current maturity date (' || v_deal.maturity_date::text || ')');
  end if;

  v_old_maturity := v_deal.maturity_date;
  v_months_added := greatest(1,
    (extract(year from age(p_new_maturity_date, v_old_maturity)) * 12 +
     extract(month from age(p_new_maturity_date, v_old_maturity)))::int
  );

  v_history_entry := jsonb_build_object(
    'extended_at', now(),
    'previous_maturity', v_old_maturity,
    'new_maturity', p_new_maturity_date,
    'months_added', v_months_added,
    'principal_at_extension', coalesce(v_deal.current_principal, v_deal.invested_amount),
    'reason', coalesce(p_reason, 'Deal tenure extended'),
    'notes', p_notes
  );

  update public.deals
  set original_maturity_date = coalesce(original_maturity_date, v_old_maturity),
      maturity_date = p_new_maturity_date,
      extension_count = coalesce(extension_count, 0) + 1,
      extensions_history = coalesce(extensions_history, '[]'::jsonb) || v_history_entry,
      status = case when status in ('MATURED', 'CLOSED') then 'ACTIVE' else status end,
      updated_at = now()
  where id = p_deal_id;

  -- Re-generate payment schedule for future period
  perform public.fn_generate_payment_schedule(p_deal_id);

  return jsonb_build_object(
    'ok', true,
    'deal_id', p_deal_id,
    'original_maturity_date', coalesce(v_deal.original_maturity_date, v_old_maturity),
    'new_maturity_date', p_new_maturity_date,
    'extension_count', coalesce(v_deal.extension_count, 0) + 1,
    'months_added', v_months_added
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

-- 4. Maturity Dual-Confirmation Settlement RPC: fn_record_maturity_settlement
create or replace function public.fn_record_maturity_settlement(
  p_deal_id bigint,
  p_settlement_date date,
  p_interest_received boolean,
  p_interest_amount numeric default 0,
  p_principal_received boolean default false,
  p_principal_amount numeric default 0,
  p_payment_mode text default 'Bank Transfer',
  p_payment_reference text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deal public.deals;
  v_payment_id bigint := null;
  v_total_paid numeric := 0;
  v_int_amt numeric := 0;
  v_prn_amt numeric := 0;
  v_new_current_principal numeric;
  v_deal_closed boolean := false;
  v_reinvest_id bigint := null;
begin
  select * into v_deal from public.deals where id = p_deal_id and user_id = v_user_id;
  if v_deal.id is null then
    return jsonb_build_object('ok', false, 'error', 'Deal not found or access denied');
  end if;

  if p_interest_received then
    v_int_amt := coalesce(p_interest_amount, 0);
  end if;

  if p_principal_received then
    v_prn_amt := coalesce(p_principal_amount, 0);
  end if;

  v_total_paid := v_int_amt + v_prn_amt;

  if v_total_paid <= 0 then
    return jsonb_build_object('ok', false, 'error', 'No positive interest or principal amount specified');
  end if;

  -- Record payment via existing payment table
  insert into public.payments (
    user_id, deal_id, transaction_date, amount, interest_amount,
    principal_amount, fee_amount, tax_amount, net_amount, payment_reference,
    payment_mode, confirmation_method, notes
  ) values (
    v_user_id, p_deal_id, coalesce(p_settlement_date, current_date), v_total_paid, v_int_amt,
    v_prn_amt, 0, 0, v_total_paid, p_payment_reference,
    p_payment_mode, 'Manual', p_notes
  )
  returning id into v_payment_id;

  -- Calculate new outstanding principal
  v_new_current_principal := greatest(0, coalesce(v_deal.current_principal, v_deal.invested_amount) - v_prn_amt);

  -- Determine if deal can close: ONLY if principal is confirmed and fully received (<= 0)
  if v_new_current_principal <= 0 and p_principal_received then
    v_deal_closed := true;
  end if;

  update public.deals
  set current_principal = v_new_current_principal,
      last_payment_date = coalesce(p_settlement_date, current_date),
      status = case
        when v_deal_closed then 'CLOSED'
        when v_prn_amt > 0 and v_new_current_principal > 0 then 'PARTIALLY_RECOVERED'
        else status
      end,
      closure_date = case when v_deal_closed then coalesce(p_settlement_date, current_date) else closure_date end,
      updated_at = now()
  where id = p_deal_id;

  -- If principal was received, create a reinvestment allocation candidate
  if v_prn_amt > 0 then
    insert into public.reinvestments (user_id, source_payment_id, returned_amount, returned_date)
    values (v_user_id, v_payment_id, v_prn_amt, coalesce(p_settlement_date, current_date))
    returning id into v_reinvest_id;
  end if;

  -- Resolve notifications for this deal
  update public.notifications
  set read_at = coalesce(read_at, now()),
      status = 'Read'
  where user_id = v_user_id and deal_id = p_deal_id and read_at is null;

  return jsonb_build_object(
    'ok', true,
    'payment_id', v_payment_id,
    'interest_received', p_interest_received,
    'interest_amount', v_int_amt,
    'principal_received', p_principal_received,
    'principal_amount', v_prn_amt,
    'remaining_principal', v_new_current_principal,
    'deal_closed', v_deal_closed,
    'reinvestment_id', v_reinvest_id
  );
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;
