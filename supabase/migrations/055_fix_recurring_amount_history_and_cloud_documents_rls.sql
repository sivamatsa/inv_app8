-- ============================================================================
-- 055: Fix recurring amount history trigger RLS & Upgrade Cloud Documents
--      storage + metadata RLS policies
-- ============================================================================
-- 1. Recurring Amount & Schedule History Fix:
--    When expected_amount or frequency changes on recurring_items, the trigger
--    `track_recurring_changes` calls `private.fn_track_recurring_changes()`.
--    Previously, that function was not SECURITY DEFINER, and neither
--    `recurring_amount_history` nor `recurring_schedule_history` had an INSERT
--    policy defined for authenticated users. This caused PostgreSQL to throw:
--    "new row violates row-level security policy for table recurring_amount_history".
--    Here we mark `private.fn_track_recurring_changes()` as SECURITY DEFINER
--    and define least-privilege INSERT, UPDATE, and DELETE policies.
--
-- 2. Cloud Documents Table & Supabase Storage RLS:
--    Upgrades the `documents` table with rich metadata columns (tags, category,
--    description, updated_at, upload_status, storage_bucket) and fixes RLS
--    for owners, admins, and shared portfolio co-managers.
--    Also provides comprehensive storage.objects RLS policies matching both
--    folder ownership, object owner UUID, and admin/shared permissions.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Recurring Amount & Schedule History RLS & Trigger Fix
-- ----------------------------------------------------------------------------

-- Add explicit INSERT/UPDATE/DELETE policies for recurring_amount_history
drop policy if exists "insert own recurring_amount_history" on public.recurring_amount_history;
create policy "insert own recurring_amount_history"
  on public.recurring_amount_history for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "update own recurring_amount_history" on public.recurring_amount_history;
create policy "update own recurring_amount_history"
  on public.recurring_amount_history for update to authenticated
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "delete own recurring_amount_history" on public.recurring_amount_history;
create policy "delete own recurring_amount_history"
  on public.recurring_amount_history for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- Add explicit INSERT/UPDATE/DELETE policies for recurring_schedule_history
drop policy if exists "insert own recurring_schedule_history" on public.recurring_schedule_history;
create policy "insert own recurring_schedule_history"
  on public.recurring_schedule_history for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "update own recurring_schedule_history" on public.recurring_schedule_history;
create policy "update own recurring_schedule_history"
  on public.recurring_schedule_history for update to authenticated
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "delete own recurring_schedule_history" on public.recurring_schedule_history;
create policy "delete own recurring_schedule_history"
  on public.recurring_schedule_history for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- Redefine trigger function as SECURITY DEFINER with safe search_path
create or replace function private.fn_track_recurring_changes()
returns trigger
language plpgsql
security definer
set search_path = public, private, pg_temp
as $$
begin
  if new.expected_amount is distinct from old.expected_amount then
    insert into public.recurring_amount_history (user_id, recurring_item_id, effective_from, old_amount, new_amount)
    values (new.user_id, new.id, current_date, old.expected_amount, new.expected_amount);
  end if;
  if new.frequency is distinct from old.frequency then
    insert into public.recurring_schedule_history (user_id, recurring_item_id, effective_from, old_frequency, new_frequency)
    values (new.user_id, new.id, current_date, old.frequency, new.frequency);
  end if;
  return new;
end;
$$;

-- Grant execution privilege
grant execute on function private.fn_track_recurring_changes() to authenticated;

-- Ensure trigger exists
drop trigger if exists track_recurring_changes on public.recurring_items;
create trigger track_recurring_changes
  before update on public.recurring_items
  for each row execute function private.fn_track_recurring_changes();

grant select, insert, update, delete on table public.recurring_amount_history to authenticated;
grant select, insert, update, delete on table public.recurring_schedule_history to authenticated;


-- ----------------------------------------------------------------------------
-- 2. Cloud Documents Table Upgrades & Metadata Organization
-- ----------------------------------------------------------------------------

-- Add rich metadata columns if they do not exist
alter table public.documents add column if not exists updated_at timestamptz not null default now();
alter table public.documents add column if not exists category text;
alter table public.documents add column if not exists description text;
alter table public.documents add column if not exists tags jsonb not null default '[]'::jsonb;
alter table public.documents add column if not exists upload_status text not null default 'COMPLETED';
alter table public.documents add column if not exists storage_bucket text not null default 'documents';

-- Ensure index for fast querying by user, category, and date
create index if not exists documents_category_idx on public.documents (category);
create index if not exists documents_upload_status_idx on public.documents (upload_status);
create index if not exists documents_created_at_idx on public.documents (created_at desc);

-- Trigger to maintain updated_at on documents
drop trigger if exists set_documents_updated_at on public.documents;
create trigger set_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- Policies on public.documents
drop policy if exists "select own documents" on public.documents;
create policy "select own documents"
  on public.documents for select to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_admin()
    or private.has_portfolio_view_access(user_id)
  );

drop policy if exists "insert own documents" on public.documents;
create policy "insert own documents"
  on public.documents for insert to authenticated
  with check (
    user_id = (select auth.uid())
    or private.is_admin()
    or exists (
      select 1 from public.shared_portfolios sp
      join public.portfolio_members pm on pm.portfolio_id = sp.id
      where sp.owner_user_id = user_id
        and sp.is_active
        and pm.member_user_id = (select auth.uid())
        and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
    )
  );

drop policy if exists "update own documents" on public.documents;
create policy "update own documents"
  on public.documents for update to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_admin()
    or exists (
      select 1 from public.shared_portfolios sp
      join public.portfolio_members pm on pm.portfolio_id = sp.id
      where sp.owner_user_id = user_id
        and sp.is_active
        and pm.member_user_id = (select auth.uid())
        and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
    )
  )
  with check (
    user_id = (select auth.uid())
    or private.is_admin()
    or exists (
      select 1 from public.shared_portfolios sp
      join public.portfolio_members pm on pm.portfolio_id = sp.id
      where sp.owner_user_id = user_id
        and sp.is_active
        and pm.member_user_id = (select auth.uid())
        and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
    )
  );

drop policy if exists "delete own documents" on public.documents;
create policy "delete own documents"
  on public.documents for delete to authenticated
  using (
    user_id = (select auth.uid())
    or private.is_admin()
    or exists (
      select 1 from public.shared_portfolios sp
      join public.portfolio_members pm on pm.portfolio_id = sp.id
      where sp.owner_user_id = user_id
        and sp.is_active
        and pm.member_user_id = (select auth.uid())
        and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
    )
  );

grant select, insert, update, delete on table public.documents to authenticated;


-- ----------------------------------------------------------------------------
-- 3. Supabase Storage Bucket & Object Policies for 'documents'
-- ----------------------------------------------------------------------------

-- Ensure bucket exists and is private (non-public) with 50MB file size limit
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 52428800, null)
on conflict (id) do update set public = false;

-- Storage SELECT policy:
-- Allows owners (by auth.uid() matching folder name or owner column),
-- admins, or authenticated users who have shared portfolio view access.
drop policy if exists "select own documents in storage" on storage.objects;
create policy "select own documents in storage"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and (
      (select auth.uid()) = owner
      or lower((select auth.uid())::text) = lower((storage.foldername(name))[1])
      or private.is_admin()
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and private.has_portfolio_view_access(((storage.foldername(name))[1])::uuid)
      )
    )
  );

-- Storage INSERT policy:
-- Allows owners (by auth.uid() matching folder name or owner column),
-- admins, or authenticated users who have shared portfolio co-management/editor rights.
drop policy if exists "insert own documents in storage" on storage.objects;
create policy "insert own documents in storage"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (
      (select auth.uid()) = owner
      or lower((select auth.uid())::text) = lower((storage.foldername(name))[1])
      or private.is_admin()
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.shared_portfolios sp
          join public.portfolio_members pm on pm.portfolio_id = sp.id
          where sp.owner_user_id = ((storage.foldername(name))[1])::uuid
            and sp.is_active
            and pm.member_user_id = (select auth.uid())
            and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
        )
      )
    )
  );

-- Storage UPDATE policy:
drop policy if exists "update own documents in storage" on storage.objects;
create policy "update own documents in storage"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and (
      (select auth.uid()) = owner
      or lower((select auth.uid())::text) = lower((storage.foldername(name))[1])
      or private.is_admin()
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.shared_portfolios sp
          join public.portfolio_members pm on pm.portfolio_id = sp.id
          where sp.owner_user_id = ((storage.foldername(name))[1])::uuid
            and sp.is_active
            and pm.member_user_id = (select auth.uid())
            and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
        )
      )
    )
  )
  with check (
    bucket_id = 'documents'
    and (
      (select auth.uid()) = owner
      or lower((select auth.uid())::text) = lower((storage.foldername(name))[1])
      or private.is_admin()
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.shared_portfolios sp
          join public.portfolio_members pm on pm.portfolio_id = sp.id
          where sp.owner_user_id = ((storage.foldername(name))[1])::uuid
            and sp.is_active
            and pm.member_user_id = (select auth.uid())
            and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
        )
      )
    )
  );

-- Storage DELETE policy:
drop policy if exists "delete own documents in storage" on storage.objects;
create policy "delete own documents in storage"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      (select auth.uid()) = owner
      or lower((select auth.uid())::text) = lower((storage.foldername(name))[1])
      or private.is_admin()
      or (
        (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and exists (
          select 1 from public.shared_portfolios sp
          join public.portfolio_members pm on pm.portfolio_id = sp.id
          where sp.owner_user_id = ((storage.foldername(name))[1])::uuid
            and sp.is_active
            and pm.member_user_id = (select auth.uid())
            and pm.role in ('Owner', 'Editor', 'Full Access', 'Co-Manager', 'Manager')
        )
      )
    )
  );
