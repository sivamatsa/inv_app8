-- ============================================================================
-- Migration 054: Website Vault Realtime Sync, RLS Hardening & Daily Goal Tracker
-- ============================================================================

-- 1. Ensure Website Vault tables are published to supabase_realtime
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'website_entries'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.website_entries;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'website_accounts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.website_accounts;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'website_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.website_groups;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'website_entry_groups'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.website_entry_groups;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- 2. Daily Goal & Habit Tracker Tables
CREATE TABLE IF NOT EXISTS public.daily_financial_habits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    icon TEXT DEFAULT '⚡',
    category TEXT DEFAULT 'FINANCIAL', -- 'FINANCIAL', 'PORTFOLIO', 'SECURITY', 'EXPENSES'
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_custom BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_habits_user_id ON public.daily_financial_habits(user_id);

CREATE TABLE IF NOT EXISTS public.daily_habit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    habit_id UUID NOT NULL REFERENCES public.daily_financial_habits(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completed BOOLEAN DEFAULT true,
    completed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(habit_id, log_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_habit_logs_user_date ON public.daily_habit_logs(user_id, log_date);

-- Realtime for habits
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'daily_financial_habits'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_financial_habits;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'daily_habit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_habit_logs;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL;
END $$;

-- Enable RLS
ALTER TABLE public.daily_financial_habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_habit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own habits" ON public.daily_financial_habits;
DROP POLICY IF EXISTS "Users can insert own habits" ON public.daily_financial_habits;
DROP POLICY IF EXISTS "Users can update own habits" ON public.daily_financial_habits;
DROP POLICY IF EXISTS "Users can delete own habits" ON public.daily_financial_habits;

CREATE POLICY "Users can view own habits" ON public.daily_financial_habits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own habits" ON public.daily_financial_habits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own habits" ON public.daily_financial_habits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own habits" ON public.daily_financial_habits FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can view own habit logs" ON public.daily_habit_logs;
DROP POLICY IF EXISTS "Users can insert own habit logs" ON public.daily_habit_logs;
DROP POLICY IF EXISTS "Users can update own habit logs" ON public.daily_habit_logs;
DROP POLICY IF EXISTS "Users can delete own habit logs" ON public.daily_habit_logs;

CREATE POLICY "Users can view own habit logs" ON public.daily_habit_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own habit logs" ON public.daily_habit_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own habit logs" ON public.daily_habit_logs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own habit logs" ON public.daily_habit_logs FOR DELETE USING (auth.uid() = user_id);
