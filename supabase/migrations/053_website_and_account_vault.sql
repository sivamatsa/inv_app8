-- ============================================================================
-- Migration 053: Website & Account Vault
-- Centralized directory and credential-management system for Investment OS.
-- Includes:
-- 1. website_entries: Main service & website directory
-- 2. website_accounts: Multiple login accounts per website
-- 3. website_groups: Managed categories & user-defined custom groups
-- 4. website_entry_groups: Many-to-many mapping between websites and groups
-- 5. website_vault_settings: User vault preferences and auto-lock configuration
-- 6. website_vault_audit: Strict security audit trail (zero secret leakage)
-- ============================================================================

-- 1. Main Website Entries Table
CREATE TABLE IF NOT EXISTS public.website_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    primary_category TEXT NOT NULL,
    description TEXT,
    logo_url TEXT,
    favicon_url TEXT,
    provider_name TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    is_favorite BOOLEAN DEFAULT false,
    is_pinned BOOLEAN DEFAULT false,
    display_order INTEGER DEFAULT 0,
    website_type TEXT, -- 'PORTAL', 'APP', 'BANKING', 'SERVICE', 'GOVERNMENT', 'UTILITY', 'OTHER'
    country TEXT DEFAULT 'IN',
    language TEXT DEFAULT 'en',
    support_url TEXT,
    support_email TEXT,
    support_phone TEXT,
    help_doc_url TEXT,
    mobile_app_link TEXT,
    importance TEXT DEFAULT 'NORMAL', -- 'LOW', 'NORMAL', 'HIGH', 'CRITICAL'
    registration_date DATE,
    renewal_date DATE,
    related_module TEXT, -- 'deals', 'gold', 'recurring', 'expenses', etc.
    related_record_id TEXT,
    last_opened_at TIMESTAMPTZ,
    last_selected_account_id UUID,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_entries_user_id ON public.website_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_website_entries_category ON public.website_entries(primary_category);
CREATE INDEX IF NOT EXISTS idx_website_entries_favorite ON public.website_entries(is_favorite);
CREATE INDEX IF NOT EXISTS idx_website_entries_archived ON public.website_entries(is_archived);
CREATE INDEX IF NOT EXISTS idx_website_entries_updated ON public.website_entries(updated_at DESC);

-- 2. Website Accounts Table (Multiple Accounts per Website)
CREATE TABLE IF NOT EXISTS public.website_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES public.website_entries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL, -- 'Personal Account', 'Primary Admin', etc.
    username TEXT,
    email_login TEXT,
    mobile_login TEXT,
    customer_id TEXT,
    encrypted_password TEXT,
    password_iv TEXT,
    password_plain TEXT, -- In-transit / local fallback when transparent
    login_method TEXT DEFAULT 'PASSWORD', -- 'PASSWORD', 'SSO_GOOGLE', 'SSO_APPLE', 'OTP', 'BIOMETRIC', 'OTHER'
    account_purpose TEXT DEFAULT 'PERSONAL', -- 'PERSONAL', 'BUSINESS', 'FAMILY', 'SECONDARY'
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,
    is_favorite BOOLEAN DEFAULT false,
    account_notes TEXT,
    encrypted_notes TEXT,
    notes_iv TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    last_used_at TIMESTAMPTZ,
    password_last_changed DATE,
    password_review_date DATE,
    two_factor_enabled BOOLEAN DEFAULT false,
    recovery_method_desc TEXT,
    subscription_plan TEXT,
    subscription_cost NUMERIC DEFAULT 0,
    subscription_currency TEXT DEFAULT 'INR',
    billing_frequency TEXT, -- 'MONTHLY', 'QUARTERLY', 'ANNUAL', 'LIFETIME'
    subscription_renewal_date DATE,
    custom_fields JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_accounts_website_id ON public.website_accounts(website_id);
CREATE INDEX IF NOT EXISTS idx_website_accounts_user_id ON public.website_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_website_accounts_is_default ON public.website_accounts(is_default);

-- 3. Groups & Categories Table
CREATE TABLE IF NOT EXISTS public.website_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    icon TEXT DEFAULT '📁',
    color TEXT DEFAULT '#C9A84C',
    display_order INTEGER DEFAULT 0,
    is_pinned BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_website_groups_user_id ON public.website_groups(user_id);
CREATE INDEX IF NOT EXISTS idx_website_groups_slug ON public.website_groups(slug);

-- 4. Website Entry Groups (Many-to-Many Mapping)
CREATE TABLE IF NOT EXISTS public.website_entry_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES public.website_entries(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES public.website_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(website_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_entry_groups_website_id ON public.website_entry_groups(website_id);
CREATE INDEX IF NOT EXISTS idx_entry_groups_group_id ON public.website_entry_groups(group_id);
CREATE INDEX IF NOT EXISTS idx_entry_groups_user_id ON public.website_entry_groups(user_id);

-- 5. User Vault Settings Table
CREATE TABLE IF NOT EXISTS public.website_vault_settings (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    auto_lock_minutes INTEGER DEFAULT 15,
    mask_passwords_by_default BOOLEAN DEFAULT true,
    require_click_to_reveal BOOLEAN DEFAULT true,
    open_and_copy_behavior TEXT DEFAULT 'BOTH', -- 'BOTH', 'OPEN_ONLY', 'COPY_ONLY'
    default_sort TEXT DEFAULT 'name', -- 'name', 'recently_used', 'importance', 'renewal_date'
    default_view TEXT DEFAULT 'card', -- 'card', 'table'
    password_review_interval_days INTEGER DEFAULT 90,
    security_disclosure_acknowledged BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Vault Audit Trail (Strict Non-Secret Logging)
CREATE TABLE IF NOT EXISTS public.website_vault_audit (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    entity_name TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vault_audit_user_id ON public.website_vault_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_audit_created_at ON public.website_vault_audit(created_at DESC);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.website_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_entry_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_vault_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.website_vault_audit ENABLE ROW LEVEL SECURITY;

-- Clean existing policies if re-running
DROP POLICY IF EXISTS "Users can view own website entries" ON public.website_entries;
DROP POLICY IF EXISTS "Users can insert own website entries" ON public.website_entries;
DROP POLICY IF EXISTS "Users can update own website entries" ON public.website_entries;
DROP POLICY IF EXISTS "Users can delete own website entries" ON public.website_entries;

DROP POLICY IF EXISTS "Users can view own website accounts" ON public.website_accounts;
DROP POLICY IF EXISTS "Users can insert own website accounts" ON public.website_accounts;
DROP POLICY IF EXISTS "Users can update own website accounts" ON public.website_accounts;
DROP POLICY IF EXISTS "Users can delete own website accounts" ON public.website_accounts;

DROP POLICY IF EXISTS "Users can view own website groups" ON public.website_groups;
DROP POLICY IF EXISTS "Users can insert own website groups" ON public.website_groups;
DROP POLICY IF EXISTS "Users can update own website groups" ON public.website_groups;
DROP POLICY IF EXISTS "Users can delete own website groups" ON public.website_groups;

DROP POLICY IF EXISTS "Users can view own website entry groups" ON public.website_entry_groups;
DROP POLICY IF EXISTS "Users can insert own website entry groups" ON public.website_entry_groups;
DROP POLICY IF EXISTS "Users can update own website entry groups" ON public.website_entry_groups;
DROP POLICY IF EXISTS "Users can delete own website entry groups" ON public.website_entry_groups;

DROP POLICY IF EXISTS "Users can view own vault settings" ON public.website_vault_settings;
DROP POLICY IF EXISTS "Users can insert own vault settings" ON public.website_vault_settings;
DROP POLICY IF EXISTS "Users can update own vault settings" ON public.website_vault_settings;

DROP POLICY IF EXISTS "Users can view own vault audit logs" ON public.website_vault_audit;
DROP POLICY IF EXISTS "Users can insert own vault audit logs" ON public.website_vault_audit;

-- Strict Per-User RLS Policies
CREATE POLICY "Users can view own website entries" ON public.website_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own website entries" ON public.website_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own website entries" ON public.website_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own website entries" ON public.website_entries FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own website accounts" ON public.website_accounts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own website accounts" ON public.website_accounts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own website accounts" ON public.website_accounts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own website accounts" ON public.website_accounts FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own website groups" ON public.website_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own website groups" ON public.website_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own website groups" ON public.website_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own website groups" ON public.website_groups FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own website entry groups" ON public.website_entry_groups FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own website entry groups" ON public.website_entry_groups FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own website entry groups" ON public.website_entry_groups FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own website entry groups" ON public.website_entry_groups FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own vault settings" ON public.website_vault_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vault settings" ON public.website_vault_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own vault settings" ON public.website_vault_settings FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can view own vault audit logs" ON public.website_vault_audit FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own vault audit logs" ON public.website_vault_audit FOR INSERT WITH CHECK (auth.uid() = user_id);
