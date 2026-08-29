-- ============================================================================
-- 047: Add WhatsApp Group Link to Deals & Expand Account Types for Emergency Funds
-- ============================================================================

-- 1. Add whatsapp_group column to public.deals
alter table public.deals add column if not exists whatsapp_group text;

-- 2. Expand account_type check constraint on public.accounts
-- This allows Savings, Fixed Deposit, Deposit, Checking, Emergency Reserve, etc.
alter table public.accounts drop constraint if exists accounts_account_type_check;

alter table public.accounts add constraint accounts_account_type_check
  check (account_type in (
    'Bank',
    'Cash',
    'Wallet',
    'Investment Account',
    'Other',
    'Savings',
    'Fixed Deposit',
    'Deposit',
    'Checking',
    'Emergency Reserve',
    'Bank Account'
  ));

-- 3. Notify PostgREST to reload schema cache immediately
notify pgrst, 'reload schema';
