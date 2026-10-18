-- ============================================================================
-- 056: Backup, Sync & Disaster Recovery Center
-- ============================================================================
-- Adds persistent tables and RLS policies for:
-- 1. backup_jobs: Full history of personal and administrator backups, exports,
--    syncs, integrity verifications, and restore jobs.
-- 2. backup_schedules: Configuration for automated recurring backups (Daily,
--    Weekly, Monthly) and Google Sheets sync schedules.
-- 3. backup_audit_logs: Detailed audit trail of all backup/restore/sync events.
-- ============================================================================

create table if not exists public.backup_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  scope text not null default 'PERSONAL' check (scope in ('PERSONAL', 'ADMIN')),
  backup_type text not null check (backup_type in (
    'PERSONAL_FULL', 'PERSONAL_DATA', 'DOCUMENTS_ONLY', 'GOOGLE_SHEETS_SYNC',
    'ADMIN_FULL', 'ADMIN_DATA', 'ADMIN_DOCUMENTS', 'DATABASE_DUMP_EXPORT', 'RESTORE_JOB'
  )),
  status text not null default 'QUEUED' check (status in (
    'QUEUED', 'RUNNING', 'COMPLETED', 'COMPLETED_WITH_WARNINGS', 'FAILED', 'CANCELLED', 'VERIFICATION_FAILED'
  )),
  destination text not null default 'LOCAL_DOWNLOAD' check (destination in (
    'LOCAL_DOWNLOAD', 'GOOGLE_SHEETS', 'GOOGLE_DRIVE', 'CLOUD_STORAGE', 'SUPABASE_STORAGE'
  )),
  destination_details jsonb default '{}'::jsonb,
  started_at timestamptz default now(),
  completed_at timestamptz,
  records_discovered integer default 0,
  records_exported integer default 0,
  files_discovered integer default 0,
  files_backed_up integer default 0,
  failed_count integer default 0,
  skipped_count integer default 0,
  output_size_bytes bigint default 0,
  checksum_sha256 text,
  schema_version text default '2.4.4',
  verified boolean default false,
  verification_details jsonb default '{}'::jsonb,
  manifest_summary jsonb default '{}'::jsonb,
  error_message text,
  error_category text,
  is_pinned boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_backup_jobs_user_status on public.backup_jobs (user_id, status, created_at desc);
create index if not exists idx_backup_jobs_scope on public.backup_jobs (scope, created_at desc);

create table if not exists public.backup_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  scope text not null default 'PERSONAL' check (scope in ('PERSONAL', 'ADMIN')),
  frequency text not null default 'MANUAL' check (frequency in ('MANUAL', 'DAILY', 'WEEKLY', 'MONTHLY')),
  preferred_time text default '02:00',
  timezone text default 'Asia/Kolkata',
  is_enabled boolean default true,
  destination text default 'LOCAL_DOWNLOAD',
  include_documents boolean default true,
  sync_google_sheets boolean default false,
  google_spreadsheet_id text,
  google_spreadsheet_url text,
  retention_days integer default 30,
  last_run_at timestamptz,
  last_status text,
  next_run_at timestamptz,
  notify_on_failure boolean default true,
  notify_on_success boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_backup_schedules_user on public.backup_schedules (user_id);

create table if not exists public.backup_audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  scope text not null default 'PERSONAL',
  details jsonb default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz default now()
);

create index if not exists idx_backup_audit_logs_user on public.backup_audit_logs (user_id, created_at desc);

-- ----------------------------------------------------------------------------
-- RLS Policies
-- ----------------------------------------------------------------------------
alter table public.backup_jobs enable row level security;
alter table public.backup_schedules enable row level security;
alter table public.backup_audit_logs enable row level security;

-- backup_jobs RLS
drop policy if exists "backup_jobs_owner_select" on public.backup_jobs;
create policy "backup_jobs_owner_select" on public.backup_jobs
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "backup_jobs_owner_insert" on public.backup_jobs;
create policy "backup_jobs_owner_insert" on public.backup_jobs
  for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "backup_jobs_owner_update" on public.backup_jobs;
create policy "backup_jobs_owner_update" on public.backup_jobs
  for update to authenticated
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "backup_jobs_owner_delete" on public.backup_jobs;
create policy "backup_jobs_owner_delete" on public.backup_jobs
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- backup_schedules RLS
drop policy if exists "backup_schedules_owner_select" on public.backup_schedules;
create policy "backup_schedules_owner_select" on public.backup_schedules
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "backup_schedules_owner_insert" on public.backup_schedules;
create policy "backup_schedules_owner_insert" on public.backup_schedules
  for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "backup_schedules_owner_update" on public.backup_schedules;
create policy "backup_schedules_owner_update" on public.backup_schedules
  for update to authenticated
  using (user_id = (select auth.uid()) or private.is_admin())
  with check (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "backup_schedules_owner_delete" on public.backup_schedules;
create policy "backup_schedules_owner_delete" on public.backup_schedules
  for delete to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

-- backup_audit_logs RLS
drop policy if exists "backup_audit_logs_owner_select" on public.backup_audit_logs;
create policy "backup_audit_logs_owner_select" on public.backup_audit_logs
  for select to authenticated
  using (user_id = (select auth.uid()) or private.is_admin());

drop policy if exists "backup_audit_logs_owner_insert" on public.backup_audit_logs;
create policy "backup_audit_logs_owner_insert" on public.backup_audit_logs
  for insert to authenticated
  with check (user_id = (select auth.uid()) or private.is_admin());

-- Grants
grant select, insert, update, delete on public.backup_jobs to authenticated;
grant select, insert, update, delete on public.backup_schedules to authenticated;
grant select, insert on public.backup_audit_logs to authenticated;
