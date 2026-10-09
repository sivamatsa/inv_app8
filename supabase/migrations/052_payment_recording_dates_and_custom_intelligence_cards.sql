-- ============================================================================
-- Migration 052: Payment Recording Date Analytics & Custom Intelligence Cards
-- Adds:
-- 1. Payment Recording Date Analytics (transaction_date, recording_date, delay_days, advance_days, timing_status)
-- 2. Enhanced fn_record_payment function supporting date analytics
-- 3. Dedicated user_intelligence_cards table for Cross-Browser Supabase Sync
-- 4. User profile custom_intel_cards JSONB column & RLS policies
-- ============================================================================

-- 1. Add Timing & Date Analytics Columns to Payments Table
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS recording_date DATE DEFAULT CURRENT_DATE,
  ADD COLUMN IF NOT EXISTS delay_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS advance_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS timing_status TEXT DEFAULT 'ON_TIME';

-- Ensure index on payments dates for fast ledger queries
CREATE INDEX IF NOT EXISTS idx_payments_recording_date ON public.payments(recording_date);
CREATE INDEX IF NOT EXISTS idx_payments_transaction_date ON public.payments(transaction_date);

-- 2. Add custom_intel_cards column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS custom_intel_cards JSONB DEFAULT '[]'::jsonb;

-- 3. Dedicated User Intelligence Cards Table (Resilient Cross-Browser Sync)
CREATE TABLE IF NOT EXISTS public.user_intelligence_cards (
    id TEXT PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    card_type TEXT NOT NULL, -- 'age', 'experience', 'countdown', 'date_diff'
    title TEXT NOT NULL,
    start_date DATE,
    end_date DATE,
    end_date_mode TEXT DEFAULT 'LIVE', -- 'LIVE' | 'FIXED'
    fixed_end_date DATE,
    target_date DATE,
    repeats_yearly BOOLEAN DEFAULT false,
    organizations JSONB DEFAULT '[]'::jsonb,
    is_pinned BOOLEAN DEFAULT false,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast user retrieval
CREATE INDEX IF NOT EXISTS idx_intel_cards_user_id ON public.user_intelligence_cards(user_id);
CREATE INDEX IF NOT EXISTS idx_intel_cards_type ON public.user_intelligence_cards(card_type);

-- Enable Row Level Security (RLS)
ALTER TABLE public.user_intelligence_cards ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if re-running
DROP POLICY IF EXISTS "Users can view own intelligence cards" ON public.user_intelligence_cards;
DROP POLICY IF EXISTS "Users can insert own intelligence cards" ON public.user_intelligence_cards;
DROP POLICY IF EXISTS "Users can update own intelligence cards" ON public.user_intelligence_cards;
DROP POLICY IF EXISTS "Users can delete own intelligence cards" ON public.user_intelligence_cards;

-- Create RLS Policies
CREATE POLICY "Users can view own intelligence cards"
    ON public.user_intelligence_cards
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own intelligence cards"
    ON public.user_intelligence_cards
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own intelligence cards"
    ON public.user_intelligence_cards
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own intelligence cards"
    ON public.user_intelligence_cards
    FOR DELETE
    USING (auth.uid() = user_id);

-- Realtime publication for live cross-device sync
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'user_intelligence_cards'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_intelligence_cards;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Silently ignore if publication does not exist or user has insufficient privileges
END $$;

-- 4. Update fn_record_payment RPC to accept and record timing analytics
CREATE OR REPLACE FUNCTION public.fn_record_payment(
    p_deal_id BIGINT,
    p_transaction_date DATE,
    p_amount NUMERIC,
    p_interest_amount NUMERIC DEFAULT NULL,
    p_principal_amount NUMERIC DEFAULT NULL,
    p_fee_amount NUMERIC DEFAULT 0,
    p_tax_amount NUMERIC DEFAULT 0,
    p_payment_reference TEXT DEFAULT NULL,
    p_payment_mode TEXT DEFAULT NULL,
    p_confirmation_method TEXT DEFAULT 'Manual',
    p_notes TEXT DEFAULT NULL,
    p_scheduled_payment_id BIGINT DEFAULT NULL,
    p_recording_date DATE DEFAULT CURRENT_DATE,
    p_delay_days INTEGER DEFAULT 0,
    p_advance_days INTEGER DEFAULT 0
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_id UUID;
    v_payment_id BIGINT;
    v_deal RECORD;
    v_new_principal NUMERIC;
    v_timing_status TEXT;
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Determine timing status
    IF p_delay_days > 0 THEN
        v_timing_status := 'DELAYED';
    ELSIF p_advance_days > 0 THEN
        v_timing_status := 'ADVANCE';
    ELSE
        v_timing_status := 'ON_TIME';
    END IF;

    -- Fetch deal
    SELECT * INTO v_deal FROM public.deals WHERE id = p_deal_id AND user_id = v_user_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Deal not found or unauthorized';
    END IF;

    -- Insert payment record with complete date analytics
    INSERT INTO public.payments (
        user_id,
        deal_id,
        transaction_date,
        recording_date,
        delay_days,
        advance_days,
        timing_status,
        amount,
        interest_amount,
        principal_amount,
        fee_amount,
        tax_amount,
        payment_reference,
        payment_mode,
        confirmation_method,
        notes,
        scheduled_payment_id,
        status
    ) VALUES (
        v_user_id,
        p_deal_id,
        p_transaction_date,
        COALESCE(p_recording_date, CURRENT_DATE),
        COALESCE(p_delay_days, 0),
        COALESCE(p_advance_days, 0),
        v_timing_status,
        p_amount,
        COALESCE(p_interest_amount, 0),
        COALESCE(p_principal_amount, 0),
        COALESCE(p_fee_amount, 0),
        COALESCE(p_tax_amount, 0),
        p_payment_reference,
        p_payment_mode,
        p_confirmation_method,
        p_notes,
        p_scheduled_payment_id,
        'CONFIRMED'
    ) RETURNING id INTO v_payment_id;

    -- Deduct principal if principal was received
    IF COALESCE(p_principal_amount, 0) > 0 THEN
        v_new_principal := GREATEST(0, COALESCE(v_deal.current_principal, v_deal.invested_amount) - p_principal_amount);
        UPDATE public.deals 
        SET current_principal = v_new_principal,
            status = CASE WHEN v_new_principal <= 0 THEN 'CLOSED' ELSE status END,
            closure_date = CASE WHEN v_new_principal <= 0 THEN p_transaction_date ELSE closure_date END,
            last_payment_date = p_transaction_date,
            updated_at = NOW()
        WHERE id = p_deal_id;
    ELSE
        UPDATE public.deals
        SET last_payment_date = p_transaction_date,
            updated_at = NOW()
        WHERE id = p_deal_id;
    END IF;

    -- If a schedule row was targeted, mark it received
    IF p_scheduled_payment_id IS NOT NULL THEN
        UPDATE public.payment_schedule
        SET status = CASE WHEN p_delay_days > 0 THEN 'RECEIVED_DELAYED' ELSE 'RECEIVED_ON_TIME' END,
            received_amount = p_amount,
            received_date = p_transaction_date,
            updated_at = NOW()
        WHERE id = p_scheduled_payment_id AND user_id = v_user_id;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'id', v_payment_id,
        'deal_id', p_deal_id,
        'amount', p_amount,
        'delay_days', p_delay_days,
        'advance_days', p_advance_days,
        'timing_status', v_timing_status
    );
END;
$$;
