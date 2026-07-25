-- Step 1: Add 'zabita' to app_role enum
-- This must be in its own transaction, committed before being used in policies
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'zabita';
