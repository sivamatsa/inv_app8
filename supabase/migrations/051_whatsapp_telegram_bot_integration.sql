-- ============================================================================
-- 051: WhatsApp & Telegram Bot Integration for Personal Investment OS
--      Provides database-backed identity linking, verification codes,
--      inbound/outbound message auditing, and notification delivery toggles
--      for Telegram and WhatsApp bots.
-- ============================================================================

-- 1. Create bot_links table
create table if not exists public.bot_links (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('telegram', 'whatsapp')),
  chat_id text,
  username text,
  is_verified boolean not null default false,
  verification_code text,
  code_expires_at timestamptz,
  preferences jsonb not null default '{
    "daily_digest": true,
    "urgent_alerts": true,
    "due_reminders": true,
    "gold_alerts": true,
    "automation_rules": true,
    "allow_queries": true,
    "allow_expenses": true
  }'::jsonb,
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, platform)
);

create index if not exists bot_links_user_id_idx on public.bot_links (user_id);
create index if not exists bot_links_platform_chat_id_idx on public.bot_links (platform, chat_id);
create index if not exists bot_links_verification_code_idx on public.bot_links (verification_code);

-- Enable RLS
alter table public.bot_links enable row level security;

drop policy if exists "select own bot_links" on public.bot_links;
create policy "select own bot_links"
  on public.bot_links for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "insert own bot_links" on public.bot_links;
create policy "insert own bot_links"
  on public.bot_links for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "update own bot_links" on public.bot_links;
create policy "update own bot_links"
  on public.bot_links for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "delete own bot_links" on public.bot_links;
create policy "delete own bot_links"
  on public.bot_links for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on public.bot_links to authenticated;
grant usage, select on sequence public.bot_links_id_seq to authenticated;

-- 2. Create bot_message_logs table for audit & troubleshooting
create table if not exists public.bot_message_logs (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  platform text not null check (platform in ('telegram', 'whatsapp')),
  direction text not null check (direction in ('inbound', 'outbound')),
  chat_id text not null,
  command text,
  message_text text not null,
  status text not null default 'success' check (status in ('success', 'failed', 'ignored')),
  error_message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bot_message_logs_user_idx on public.bot_message_logs (user_id, created_at desc);
create index if not exists bot_message_logs_platform_chat_idx on public.bot_message_logs (platform, chat_id, created_at desc);

alter table public.bot_message_logs enable row level security;

drop policy if exists "select own bot_message_logs" on public.bot_message_logs;
create policy "select own bot_message_logs"
  on public.bot_message_logs for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "insert own bot_message_logs" on public.bot_message_logs;
create policy "insert own bot_message_logs"
  on public.bot_message_logs for insert to authenticated
  with check (user_id = (select auth.uid()));

grant select, insert on public.bot_message_logs to authenticated;
grant usage, select on sequence public.bot_message_logs_id_seq to authenticated;

-- 3. Extend notification_type_preferences with whatsapp and telegram channels
alter table public.notification_type_preferences
  add column if not exists whatsapp boolean not null default true,
  add column if not exists telegram boolean not null default true;

-- 4. Helper Function: Generate a 6-digit Bot Linking Verification Code
create or replace function public.fn_generate_bot_link_code(
  p_platform text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid;
  v_code text;
  v_existing_id bigint;
begin
  v_uid := auth.uid();
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  if p_platform not in ('telegram', 'whatsapp') then
    raise exception 'Invalid platform: must be telegram or whatsapp';
  end if;

  -- Generate 6-digit random code
  v_code := lpad((floor(random() * 900000) + 100000)::text, 6, '0');

  -- Upsert bot_links with new verification code expiring in 15 minutes
  insert into public.bot_links (user_id, platform, verification_code, code_expires_at, is_verified, updated_at)
  values (v_uid, p_platform, v_code, now() + interval '15 minutes', false, now())
  on conflict (user_id, platform) do update set
    verification_code = excluded.verification_code,
    code_expires_at = excluded.code_expires_at,
    updated_at = now();

  return v_code;
end;
$$;

grant execute on function public.fn_generate_bot_link_code(text) to authenticated;

-- 5. Helper Function: Verify and bind bot link via code (used by Webhooks)
create or replace function public.fn_verify_bot_link(
  p_platform text,
  p_chat_id text,
  p_code text,
  p_username text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_link record;
begin
  select * into v_link
  from public.bot_links
  where platform = p_platform
    and verification_code = trim(p_code)
    and code_expires_at > now()
  order by updated_at desc
  limit 1;

  if v_link.id is null then
    return null;
  end if;

  -- Link verified: update chat_id, username, clear code
  update public.bot_links
  set chat_id = p_chat_id,
      username = coalesce(p_username, username),
      is_verified = true,
      verification_code = null,
      code_expires_at = null,
      last_active_at = now(),
      updated_at = now()
  where id = v_link.id;

  return v_link.user_id;
end;
$$;

-- 6. Helper Function: Retrieve fast Portfolio Summary for Bot query (/summary)
create or replace function public.fn_get_bot_portfolio_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total_invested numeric := 0;
  v_active_deals int := 0;
  v_total_deals int := 0;
  v_due_7days numeric := 0;
  v_overdue_amt numeric := 0;
  v_overdue_count int := 0;
  v_user_name text := 'Investor';
  v_result jsonb;
begin
  -- User name
  select coalesce(full_name, username, 'Investor') into v_user_name
  from public.profiles
  where id = p_user_id;

  -- Deals stats
  select
    coalesce(sum(case when status = 'Active' then invested_amount else 0 end), 0),
    count(case when status = 'Active' then 1 else null end),
    count(*)
  into v_total_invested, v_active_deals, v_total_deals
  from public.deals
  where user_id = p_user_id;

  -- Due payments next 7 days
  select coalesce(sum(expected_total), 0)
  into v_due_7days
  from public.payment_schedule
  where user_id = p_user_id
    and status in ('SCHEDULED', 'OVERDUE')
    and scheduled_date between current_date and current_date + 7;

  -- Overdue payments
  select coalesce(sum(expected_total), 0), count(*)
  into v_overdue_amt, v_overdue_count
  from public.payment_schedule
  where user_id = p_user_id
    and status = 'OVERDUE';

  v_result := jsonb_build_object(
    'user_name', v_user_name,
    'total_invested', v_total_invested,
    'active_deals', v_active_deals,
    'total_deals', v_total_deals,
    'due_next_7_days', v_due_7days,
    'overdue_amount', v_overdue_amt,
    'overdue_count', v_overdue_count,
    'as_of', now()
  );

  return v_result;
end;
$$;

grant execute on function public.fn_get_bot_portfolio_summary(uuid) to authenticated;

-- Notify PostgREST to reload schema
notify pgrst, 'reload schema';
