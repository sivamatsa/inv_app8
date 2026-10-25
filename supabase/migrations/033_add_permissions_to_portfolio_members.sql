-- ============================================================================
-- 033: Add permissions JSONB column to portfolio_members for granular sharing
-- ============================================================================
alter table public.portfolio_members add column if not exists permissions jsonb not null default '{}'::jsonb;
