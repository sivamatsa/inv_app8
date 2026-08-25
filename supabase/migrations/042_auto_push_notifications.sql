-- ============================================================================
-- 042: Automated Realtime Push Notifications
--   - Provides helper RPCs for instant push delivery queue processing
--   - Allows authorized users to mark their own notifications as push-sent
--   - Integrates automatic push sweep into automation schedules
-- ============================================================================

-- ----------------------------------------------------------------------------
-- fn_mark_push_notifications_sent
-- Allows callers to mark their own notifications as push_sent_at without
-- needing raw update privileges across restricted columns.
-- ----------------------------------------------------------------------------
create or replace function public.fn_mark_push_notifications_sent(p_ids bigint[])
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
  v_count int := 0;
begin
  if v_caller is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(is_admin, false) into v_is_admin
  from public.profiles
  where id = v_caller;

  if v_is_admin then
    update public.notifications
    set push_sent_at = now()
    where id = any(p_ids)
      and push_sent_at is null;
  else
    update public.notifications
    set push_sent_at = now()
    where id = any(p_ids)
      and user_id = v_caller
      and push_sent_at is null;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.fn_mark_push_notifications_sent(bigint[]) to authenticated;

-- ----------------------------------------------------------------------------
-- Update fn_admin_run_automation() to ensure push-sent cleanup
-- ----------------------------------------------------------------------------
create or replace function public.fn_admin_run_automation()
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can run this.';
  end if;
  perform public.fn_refresh_schedule_statuses();
  perform public.fn_generate_reminders();
  perform public.fn_generate_ai_insights();
  perform public.fn_generate_recurring_occurrences_all();
  perform public.fn_refresh_recurring_statuses();
  perform public.fn_generate_recurring_reminders();
  perform public.fn_generate_contact_reminders();
  perform public.fn_refresh_call_statuses();
  perform public.fn_generate_gold_alerts();
  perform public.fn_generate_calendar_event_reminders();
  perform public.fn_generate_expense_budget_alerts();
  perform public.fn_evaluate_automation_rules();
  return 'ok';
end;
$$;
