-- ============================================================================
-- 045: Fix portfolio_members foreign key constraint & support granular roles
-- ============================================================================
-- Allows inviting collaborators, co-managers, family members, or external
-- emails into granular portfolio sharing without requiring an immediate
-- matching row in auth.users at invite time.
-- Also extends role checks to support 'Full Access' and 'Commenter' alongside
-- 'Owner', 'Editor', and 'Viewer'.
-- ============================================================================

-- 1. Drop the strict foreign key to auth.users if present
alter table if exists public.portfolio_members
  drop constraint if exists portfolio_members_member_user_id_fkey;

-- 2. Drop strict role check constraint and allow full granular role taxonomy
alter table if exists public.portfolio_members
  drop constraint if exists portfolio_members_role_check;

alter table if exists public.portfolio_members
  add constraint portfolio_members_role_check
  check (role in ('Owner', 'Editor', 'Viewer', 'Commenter', 'Full Access', 'Co-Manager', 'Manager', 'Advisor'));

-- 3. Ensure permissions jsonb column exists
alter table if exists public.portfolio_members
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- 4. Ensure index on member_user_id exists
create index if not exists portfolio_members_member_user_id_idx on public.portfolio_members (member_user_id);
create index if not exists portfolio_members_portfolio_id_idx on public.portfolio_members (portfolio_id);

-- 5. Ensure RLS policies are up-to-date and permit owners to manage all members
alter table if exists public.portfolio_members enable row level security;

drop policy if exists "select own membership or as owner" on public.portfolio_members;
create policy "select own membership or as owner"
  on public.portfolio_members for select to authenticated
  using (
    member_user_id = (select auth.uid())
    or portfolio_id in (select id from public.shared_portfolios where owner_user_id = (select auth.uid()))
  );

drop policy if exists "owner manages membership" on public.portfolio_members;
create policy "owner manages membership"
  on public.portfolio_members for all to authenticated
  using (
    portfolio_id in (select id from public.shared_portfolios where owner_user_id = (select auth.uid()))
  )
  with check (
    portfolio_id in (select id from public.shared_portfolios where owner_user_id = (select auth.uid()))
  );

-- 6. Helper function to ensure profiles exist for invited users if needed
create or replace function public.get_display_names(p_user_ids uuid[])
returns table(id uuid, full_name text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select p.id, coalesce(nullif(p.full_name, ''), p.email, p.id::text) as full_name
  from public.profiles p
  where p.id = any(p_user_ids);
end;
$$;

grant execute on function public.get_display_names(uuid[]) to authenticated, anon;
