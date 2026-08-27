-- ============================================================================
-- 043: Database Health & Maintenance - Granular Table Operations
--      Allows admin users to inspect table records, clear individual tables,
--      purge historical logs & transient events, and optimize database storage.
-- ============================================================================

-- Safe table clearing function for admins
create or replace function public.fn_admin_clear_table(p_table_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted_count bigint := 0;
  v_table text;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can run this operation.';
  end if;

  -- Verify table exists in public schema
  select c.relname into v_table
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname = p_table_name;

  if v_table is null then
    raise exception 'Table public.% does not exist.', p_table_name;
  end if;

  -- Safety protection: do not allow dropping user profiles through this simple truncate
  if v_table in ('profiles') then
    raise exception 'Table % cannot be wiped directly. Use User Management instead.', v_table;
  end if;

  -- Execute dependent table cleanup where needed for foreign keys
  if v_table = 'deals' then
    delete from public.reinvestments;
    delete from public.payments;
    delete from public.payment_schedule;
    delete from public.deals;
    analyze public.reinvestments;
    analyze public.payments;
    analyze public.payment_schedule;
    analyze public.deals;
  elsif v_table = 'recurring_items' then
    delete from public.recurring_occurrences;
    delete from public.recurring_amount_history;
    delete from public.recurring_schedule_history;
    delete from public.recurring_pauses;
    delete from public.recurring_items;
    analyze public.recurring_occurrences;
    analyze public.recurring_amount_history;
    analyze public.recurring_schedule_history;
    analyze public.recurring_pauses;
    analyze public.recurring_items;
  elsif v_table = 'expense_projects' then
    delete from public.expense_transactions;
    delete from public.expense_advances;
    delete from public.expense_categories;
    delete from public.expense_project_custom_fields;
    delete from public.expense_projects;
    analyze public.expense_transactions;
    analyze public.expense_advances;
    analyze public.expense_categories;
    analyze public.expense_project_custom_fields;
    analyze public.expense_projects;
  elsif v_table = 'contacts' then
    delete from public.contact_phones;
    delete from public.contact_emails;
    delete from public.contact_addresses;
    delete from public.contact_group_members;
    delete from public.contact_important_dates;
    delete from public.contact_notes;
    delete from public.contact_reminders;
    delete from public.contacts;
    analyze public.contact_phones;
    analyze public.contact_emails;
    analyze public.contact_addresses;
    analyze public.contact_group_members;
    analyze public.contact_important_dates;
    analyze public.contact_notes;
    analyze public.contact_reminders;
    analyze public.contacts;
  elsif v_table = 'conversations' then
    delete from public.messages;
    delete from public.conversation_members;
    delete from public.conversations;
    analyze public.messages;
    analyze public.conversation_members;
    analyze public.conversations;
  elsif v_table = 'support_tickets' then
    delete from public.ticket_messages;
    delete from public.ticket_internal_notes;
    delete from public.support_tickets;
    analyze public.ticket_messages;
    analyze public.ticket_internal_notes;
    analyze public.support_tickets;
  elsif v_table = 'feature_suggestions' then
    delete from public.suggestion_internal_notes;
    delete from public.suggestion_votes;
    delete from public.feature_suggestions;
    analyze public.suggestion_internal_notes;
    analyze public.suggestion_votes;
    analyze public.feature_suggestions;
  elsif v_table = 'blog_posts' then
    delete from public.blog_comments;
    delete from public.blog_posts;
    analyze public.blog_comments;
    analyze public.blog_posts;
  else
    -- Generic dynamic execution for standard tables
    execute format('delete from public.%I', v_table);
    execute format('analyze public.%I', v_table);
  end if;

  return jsonb_build_object(
    'ok', true,
    'table', v_table,
    'message', format('Table public.%s was cleared successfully.', v_table)
  );
end;
$$;

revoke execute on function public.fn_admin_clear_table(text) from public, anon;
grant execute on function public.fn_admin_clear_table(text) to authenticated;


-- Quick log & transient event purger
create or replace function public.fn_admin_purge_old_logs(p_days_old int default 30)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cutoff timestamptz;
  v_audit_count bigint := 0;
  v_login_count bigint := 0;
  v_copilot_count bigint := 0;
  v_notif_count bigint := 0;
begin
  if not private.is_admin() then
    raise exception 'Only an admin can run this operation.';
  end if;

  v_cutoff := now() - (p_days_old || ' days')::interval;

  -- 1. Audit logs
  delete from public.audit_logs where created_at < v_cutoff;
  get diagnostics v_audit_count = row_count;
  analyze public.audit_logs;

  -- 2. Login events
  delete from public.login_events where occurred_at < v_cutoff;
  get diagnostics v_login_count = row_count;
  analyze public.login_events;

  -- 3. Copilot usage
  delete from public.copilot_usage where created_at < v_cutoff;
  get diagnostics v_copilot_count = row_count;
  analyze public.copilot_usage;

  -- 4. Read notifications older than cutoff
  delete from public.notifications where is_read = true and created_at < v_cutoff;
  get diagnostics v_notif_count = row_count;
  analyze public.notifications;

  return jsonb_build_object(
    'ok', true,
    'cutoff', v_cutoff,
    'audit_logs_purged', v_audit_count,
    'login_events_purged', v_login_count,
    'copilot_usage_purged', v_copilot_count,
    'notifications_purged', v_notif_count,
    'total_purged', (v_audit_count + v_login_count + v_copilot_count + v_notif_count)
  );
end;
$$;

revoke execute on function public.fn_admin_purge_old_logs(int) from public, anon;
grant execute on function public.fn_admin_purge_old_logs(int) to authenticated;
