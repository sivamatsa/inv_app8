-- ============================================================================
-- 048: Add Start Date, Maturity Date, Interest Rate & Maturity Amount to Accounts
-- ============================================================================

-- Add Fixed Deposit / Deposit maturity tracking fields to public.accounts
alter table public.accounts add column if not exists start_date date;
alter table public.accounts add column if not exists maturity_date date;
alter table public.accounts add column if not exists interest_rate numeric;
alter table public.accounts add column if not exists maturity_amount numeric;

-- Reload PostgREST schema cache
notify pgrst, 'reload schema';
