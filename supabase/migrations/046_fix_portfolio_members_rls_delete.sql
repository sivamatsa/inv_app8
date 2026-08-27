-- ============================================================================
-- 046: Strengthen Portfolio Member Deletion, RLS, and Collaborative Permissions
-- ============================================================================

-- 1. Dedicated security definer procedure for robust member removal
create or replace function public.delete_portfolio_member(
  p_id bigint default null,
  p_portfolio_id bigint default null,
  p_member_user_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_is_admin boolean := false;
begin
  -- Check admin
  select coalesce(p.is_admin, false) into v_is_admin
  from public.profiles p
  where p.id = v_caller;

  if p_id is not null and p_id > 0 then
    delete from public.portfolio_members
    where id = p_id
      and (
        v_is_admin
        or portfolio_id in (select sp.id from public.shared_portfolios sp where sp.owner_user_id = v_caller)
        or member_user_id = v_caller
      );
    return true;
  end if;

  if p_portfolio_id is not null and p_member_user_id is not null then
    delete from public.portfolio_members
    where portfolio_id = p_portfolio_id
      and (member_user_id::text = p_member_user_id or member_user_id::text = lower(p_member_user_id))
      and (
        v_is_admin
        or portfolio_id in (select sp.id from public.shared_portfolios sp where sp.owner_user_id = v_caller)
        or member_user_id = v_caller
      );
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.delete_portfolio_member(bigint, bigint, text) to authenticated, anon;

-- 2. Ensure RLS on portfolio_members is explicitly permissive for owner/admin/member delete
drop policy if exists "owner manages membership" on public.portfolio_members;
create policy "owner manages membership"
  on public.portfolio_members for all to authenticated
  using (
    portfolio_id in (select id from public.shared_portfolios where owner_user_id = (select auth.uid()))
    or member_user_id = (select auth.uid())
    or private.is_admin()
  )
  with check (
    portfolio_id in (select id from public.shared_portfolios where owner_user_id = (select auth.uid()))
    or member_user_id = (select auth.uid())
    or private.is_admin()
  );

-- 3. Collaborative Portfolio Discussions Table (for Commenters, Editors, Full Access Co-Managers)
create table if not exists public.portfolio_comments (
  id bigint generated always as identity primary key,
  portfolio_id bigint not null references public.shared_portfolios(id) on delete cascade,
  deal_id bigint references public.deals(id) on delete set null,
  author_user_id uuid not null references auth.users(id) on delete cascade,
  author_name text,
  comment_type text not null default 'General',
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists portfolio_comments_portfolio_id_idx on public.portfolio_comments (portfolio_id);
create index if not exists portfolio_comments_deal_id_idx on public.portfolio_comments (deal_id);

alter table public.portfolio_comments enable row level security;

drop policy if exists "view portfolio comments" on public.portfolio_comments;
create policy "view portfolio comments"
  on public.portfolio_comments for select to authenticated
  using (
    portfolio_id in (select id from public.shared_portfolios where owner_user_id = (select auth.uid()))
    or portfolio_id in (select portfolio_id from public.portfolio_members where member_user_id = (select auth.uid()))
    or private.is_admin()
  );

drop policy if exists "insert portfolio comments" on public.portfolio_comments;
create policy "insert portfolio comments"
  on public.portfolio_comments for insert to authenticated
  with check (
    portfolio_id in (select id from public.shared_portfolios where owner_user_id = (select auth.uid()))
    or portfolio_id in (select portfolio_id from public.portfolio_members where member_user_id = (select auth.uid()))
    or private.is_admin()
  );
