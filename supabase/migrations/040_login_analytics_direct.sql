-- ============================================================================
-- 040: Direct In-Database Login & Visit Analytics Logging
--      Guarantees that every login captures customer device, mobile/desktop,
--      browser, OS, screen resolution, timezone, language, IP, and location
--      directly into postgres via a SECURITY DEFINER function, without
--      depending on external edge function deployments.
-- ============================================================================

-- Ensure all customer telemetry columns exist on public.login_events
alter table public.login_events add column if not exists screen_resolution text;
alter table public.login_events add column if not exists language text;
alter table public.login_events add column if not exists timezone text;

-- Create an index on (occurred_at desc) and (user_id) if not already created
create index if not exists login_events_occurred_at_idx on public.login_events (occurred_at desc);
create index if not exists login_events_user_id_idx on public.login_events (user_id);

-- Ensure RLS allows admin to select all login_events
alter table public.login_events enable row level security;

drop policy if exists "admin select login_events" on public.login_events;
create policy "admin select login_events"
  on public.login_events for select
  to authenticated
  using (private.is_admin());

grant select on public.login_events to authenticated;

-- ----------------------------------------------------------------------------
-- fn_log_login - callable by any authenticated user on sign-in.
-- Records the user's login event securely with verified auth.uid().
-- ----------------------------------------------------------------------------
create or replace function public.fn_log_login(
  p_ip text default null,
  p_city text default null,
  p_region text default null,
  p_country text default null,
  p_user_agent text default null,
  p_browser text default null,
  p_os text default null,
  p_device_type text default null,
  p_screen_resolution text default null,
  p_language text default null,
  p_timezone text default null,
  p_consent boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'Not authenticated');
  end if;

  insert into public.login_events (
    user_id,
    occurred_at,
    ip_address,
    city,
    region,
    country,
    user_agent,
    browser,
    os,
    device_type,
    screen_resolution,
    language,
    timezone,
    consent_given
  ) values (
    v_user_id,
    now(),
    p_ip,
    p_city,
    p_region,
    p_country,
    p_user_agent,
    p_browser,
    p_os,
    p_device_type,
    p_screen_resolution,
    p_language,
    p_timezone,
    coalesce(p_consent, true)
  );

  return jsonb_build_object('ok', true);
exception
  when others then
    return jsonb_build_object('ok', false, 'error', SQLERRM);
end;
$$;

revoke execute on function public.fn_log_login(text, text, text, text, text, text, text, text, text, text, text, boolean) from public, anon;
grant execute on function public.fn_log_login(text, text, text, text, text, text, text, text, text, text, text, boolean) to authenticated;
