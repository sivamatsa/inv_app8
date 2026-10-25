-- ============================================================================
-- 049: Fix Admin User Management Roles, Table Row Deletion, and Payment Notifications
-- ============================================================================

-- 1. Ensure profiles table has role and is_developer columns
alter table public.profiles
  add column if not exists is_developer boolean default false,
  add column if not exists role text default 'User';

-- 2. Enhance fn_admin_update_user to support is_developer and role
create or replace function public.fn_admin_update_user(
  p_user_id uuid,
  p_full_name text default null,
  p_email text default null,
  p_mobile text default null,
  p_is_admin boolean default null,
  p_is_active boolean default null,
  p_new_password text default null,
  p_is_developer boolean default null,
  p_role text default null
)
returns jsonb
language plpgsql
security definer
set search_path = 'public', 'extensions', 'auth'
as $$
declare
  v_caller_id uuid;
  v_is_caller_admin boolean;
  v_clean_email text;
  v_assigned_role text;
  v_is_dev boolean;
  v_is_adm boolean;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select is_admin into v_is_caller_admin
  from public.profiles
  where id = v_caller_id;

  if not coalesce(v_is_caller_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Permission denied: Only administrators can update users');
  end if;

  if p_email is not null and trim(p_email) <> '' then
    v_clean_email := lower(trim(p_email));
  end if;

  v_is_dev := coalesce(p_is_developer, false);
  v_is_adm := coalesce(p_is_admin, false) or v_is_dev;
  v_assigned_role := coalesce(p_role, case when v_is_dev then 'Developer' when v_is_adm then 'Administrator' else 'User' end);

  -- Update public.profiles table
  update public.profiles
  set full_name = coalesce(p_full_name, full_name),
      email = coalesce(v_clean_email, email),
      mobile = coalesce(p_mobile, mobile),
      is_admin = case when p_is_admin is not null then p_is_admin else is_admin end,
      is_developer = case when p_is_developer is not null then p_is_developer else is_developer end,
      role = case when p_role is not null then p_role else (case when coalesce(p_is_developer, is_developer) then 'Developer' when coalesce(p_is_admin, is_admin) then 'Administrator' else role end) end,
      is_active = coalesce(p_is_active, is_active),
      updated_at = now()
  where id = p_user_id;

  -- Update auth.users metadata and password if requested
  update auth.users
  set email = coalesce(v_clean_email, email),
      encrypted_password = case
        when p_new_password is not null and length(trim(p_new_password)) >= 6
          then crypt(trim(p_new_password), gen_salt('bf'))
        else encrypted_password
      end,
      raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'full_name', coalesce(p_full_name, raw_user_meta_data->>'full_name'),
        'is_admin', coalesce(p_is_admin, (raw_user_meta_data->>'is_admin')::boolean, false),
        'is_developer', coalesce(p_is_developer, (raw_user_meta_data->>'is_developer')::boolean, false),
        'role', v_assigned_role
      ),
      updated_at = now()
  where id = p_user_id;

  return jsonb_build_object('ok', true, 'userId', p_user_id, 'is_admin', v_is_adm, 'is_developer', v_is_dev, 'role', v_assigned_role);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke execute on function public.fn_admin_update_user(uuid, text, text, text, boolean, boolean, text, boolean, text) from public, anon;
grant execute on function public.fn_admin_update_user(uuid, text, text, text, boolean, boolean, text, boolean, text) to authenticated;

-- 3. Dedicated RPC for Admin Database Health single row delete (bypasses RLS safely under admin privilege)
create or replace function public.fn_admin_delete_table_row(
  p_table_name text,
  p_id text,
  p_id_col text default 'id'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid;
  v_is_caller_admin boolean;
  v_table text;
  v_col text;
  v_deleted_count int := 0;
begin
  v_caller_id := auth.uid();
  if v_caller_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  select is_admin into v_is_caller_admin
  from public.profiles
  where id = v_caller_id;

  if not coalesce(v_is_caller_admin, false) then
    return jsonb_build_object('ok', false, 'error', 'Permission denied: Only administrators can delete records directly');
  end if;

  -- Validate table exists in public schema
  select c.relname into v_table
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and c.relname = p_table_name;

  if v_table is null then
    return jsonb_build_object('ok', false, 'error', format('Table public.%s does not exist', p_table_name));
  end if;

  -- Protect critical table
  if v_table = 'profiles' and p_id = v_caller_id::text then
    return jsonb_build_object('ok', false, 'error', 'You cannot delete your own admin profile row here.');
  end if;

  -- Validate column exists on the table
  select a.attname into v_col
  from pg_catalog.pg_attribute a
  join pg_catalog.pg_class c on c.oid = a.attrelid
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = v_table and a.attname = p_id_col and a.attnum > 0 and not a.attisdropped;

  if v_col is null then
    return jsonb_build_object('ok', false, 'error', format('Column %s does not exist on table %s', p_id_col, p_table_name));
  end if;

  -- Execute deletion dynamically
  execute format('delete from public.%I where %I::text = $1', v_table, v_col) using p_id;
  get diagnostics v_deleted_count = row_count;

  return jsonb_build_object('ok', true, 'deleted_count', v_deleted_count, 'table', v_table, 'id', p_id);
exception when others then
  return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke execute on function public.fn_admin_delete_table_row(text, text, text) from public, anon;
grant execute on function public.fn_admin_delete_table_row(text, text, text) to authenticated;

-- 4. Automatically set Developer role for radhakrishna108566@gmail.com if present in profiles
update public.profiles
set is_admin = true,
    is_developer = true,
    role = 'Developer',
    updated_at = now()
where lower(trim(email)) = 'radhakrishna108566@gmail.com';

-- 5. Enhanced fn_record_payment: auto-resolve and mark pending notifications as read on payment record
create or replace function public.fn_record_payment(
  p_deal_id bigint,
  p_transaction_date date,
  p_amount numeric,
  p_interest_amount numeric default null,
  p_principal_amount numeric default null,
  p_fee_amount numeric default 0,
  p_tax_amount numeric default 0,
  p_payment_reference text default null,
  p_payment_mode text default null,
  p_confirmation_method text default 'Manual',
  p_notes text default null,
  p_scheduled_payment_id bigint default null
)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_deal public.deals;
  v_sched public.payment_schedule;
  v_payment_id bigint;
  v_net numeric;
  v_classification text;
  v_days_diff int;
  v_matched_total numeric;
begin
  select * into v_deal from public.deals where id = p_deal_id and user_id = v_user_id;
  if v_deal.id is null then
    raise exception 'Deal % not found or not owned by caller', p_deal_id;
  end if;

  if p_scheduled_payment_id is not null then
    select * into v_sched from public.payment_schedule where id = p_scheduled_payment_id and deal_id = p_deal_id;
  else
    select * into v_sched
    from public.payment_schedule
    where deal_id = p_deal_id
      and status in ('UPCOMING', 'DUE_TODAY', 'OVERDUE', 'PARTIALLY_RECEIVED')
    order by abs(scheduled_date - p_transaction_date), scheduled_date
    limit 1;
  end if;

  v_net := p_amount - coalesce(p_fee_amount, 0) - coalesce(p_tax_amount, 0);

  insert into public.payments (
    user_id, deal_id, scheduled_payment_id, transaction_date, amount, interest_amount,
    principal_amount, fee_amount, tax_amount, net_amount, payment_reference, payment_mode,
    confirmation_method, notes
  ) values (
    v_user_id, p_deal_id, v_sched.id, p_transaction_date, p_amount, p_interest_amount,
    p_principal_amount, coalesce(p_fee_amount, 0), coalesce(p_tax_amount, 0), v_net, p_payment_reference,
    p_payment_mode, p_confirmation_method, p_notes
  )
  returning id into v_payment_id;

  if v_sched.id is not null then
    v_days_diff := p_transaction_date - v_sched.scheduled_date;
    v_classification := case
      when v_days_diff < 0 then 'RECEIVED_EARLY'
      when v_days_diff = 0 then 'RECEIVED_ON_TIME'
      else 'RECEIVED_LATE'
    end;

    select coalesce(sum(amount), 0) into v_matched_total
    from public.payments
    where scheduled_payment_id = v_sched.id and not is_voided;

    update public.payment_schedule
    set status = case when v_matched_total >= coalesce(expected_total, v_matched_total)
                    then v_classification else 'PARTIALLY_RECEIVED' end,
        actual_payment_id = v_payment_id
    where id = v_sched.id;
  end if;

  -- Update deal's last/next payment date and outstanding principal
  update public.deals
  set last_payment_date = p_transaction_date,
      current_principal = greatest(0, current_principal - coalesce(p_principal_amount, 0)),
      next_payment_date = (
        select min(scheduled_date) from public.payment_schedule
        where deal_id = p_deal_id and status in ('UPCOMING', 'DUE_TODAY', 'OVERDUE')
      )
  where id = p_deal_id;

  if p_principal_amount is not null and p_principal_amount > 0 then
    insert into public.reinvestments (user_id, source_payment_id, returned_amount, returned_date)
    values (v_user_id, v_payment_id, p_principal_amount, p_transaction_date);
  end if;

  -- Auto-resolve and mark pending payment reminders for this deal/schedule as read
  update public.notifications
  set read_at = coalesce(read_at, now()),
      status = 'Read'
  where user_id = v_user_id
    and deal_id = p_deal_id
    and (schedule_id is null or (v_sched.id is not null and schedule_id = v_sched.id))
    and read_at is null;

  return v_payment_id;
end;
$$;

