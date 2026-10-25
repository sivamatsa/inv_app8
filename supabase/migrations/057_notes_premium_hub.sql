-- ============================================================================
-- 057: Premium Notes & Knowledge Hub Upgrade
--      Non-destructive extensions to notes, custom folders, templates,
--      version history snapshots, and strict Row Level Security (RLS).
-- ============================================================================

-- 1. Create note_folders table for custom user organization
create table if not exists public.note_folders (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text default '#c9a84c',
  icon text default '📁',
  parent_id bigint references public.note_folders(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists note_folders_user_id_idx on public.note_folders (user_id);

alter table public.note_folders enable row level security;

drop policy if exists "select own note_folders" on public.note_folders;
create policy "select own note_folders"
  on public.note_folders for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "insert own note_folders" on public.note_folders;
create policy "insert own note_folders"
  on public.note_folders for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "update own note_folders" on public.note_folders;
create policy "update own note_folders"
  on public.note_folders for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "delete own note_folders" on public.note_folders;
create policy "delete own note_folders"
  on public.note_folders for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.note_folders to authenticated;

-- 2. Extend public.notes non-destructively
alter table public.notes
  add column if not exists content_html text,
  add column if not exists folder_id bigint references public.note_folders(id) on delete set null,
  add column if not exists tags text[] default '{}',
  add column if not exists is_pinned boolean default false,
  add column if not exists is_favorite boolean default false,
  add column if not exists is_archived boolean default false,
  add column if not exists in_trash boolean default false,
  add column if not exists trashed_at timestamptz,
  add column if not exists color text,
  add column if not exists reminder_at timestamptz,
  add column if not exists due_at timestamptz,
  add column if not exists priority text default 'NORMAL',
  add column if not exists linked_entities jsonb default '[]'::jsonb,
  add column if not exists version integer default 1;

create index if not exists notes_folder_id_idx on public.notes (folder_id);
create index if not exists notes_is_pinned_idx on public.notes (is_pinned);
create index if not exists notes_is_favorite_idx on public.notes (is_favorite);
create index if not exists notes_in_trash_idx on public.notes (in_trash);
create index if not exists notes_reminder_at_idx on public.notes (reminder_at);

-- 3. Create note_templates table
create table if not exists public.note_templates (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text,
  content_html text not null,
  category text default 'General',
  is_default boolean default false,
  created_at timestamptz not null default now()
);

create index if not exists note_templates_user_id_idx on public.note_templates (user_id);

alter table public.note_templates enable row level security;

drop policy if exists "select own note_templates" on public.note_templates;
create policy "select own note_templates"
  on public.note_templates for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "insert own note_templates" on public.note_templates;
create policy "insert own note_templates"
  on public.note_templates for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "update own note_templates" on public.note_templates;
create policy "update own note_templates"
  on public.note_templates for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "delete own note_templates" on public.note_templates;
create policy "delete own note_templates"
  on public.note_templates for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, update, delete on table public.note_templates to authenticated;

-- 4. Create note_history table for version restoration
create table if not exists public.note_history (
  id bigint generated always as identity primary key,
  note_id bigint not null references public.notes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  content_html text,
  change_summary text,
  version integer not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists note_history_note_id_idx on public.note_history (note_id);
create index if not exists note_history_user_id_idx on public.note_history (user_id);

alter table public.note_history enable row level security;

drop policy if exists "select own note_history" on public.note_history;
create policy "select own note_history"
  on public.note_history for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "insert own note_history" on public.note_history;
create policy "insert own note_history"
  on public.note_history for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "delete own note_history" on public.note_history;
create policy "delete own note_history"
  on public.note_history for delete to authenticated
  using (user_id = (select auth.uid()));

grant select, insert, delete on table public.note_history to authenticated;
