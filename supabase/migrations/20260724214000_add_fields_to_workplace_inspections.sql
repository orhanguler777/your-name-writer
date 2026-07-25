-- Add extra fields to workplace_inspections
ALTER TABLE public.workplace_inspections
  ADD COLUMN IF NOT EXISTS tax_office TEXT,
  ADD COLUMN IF NOT EXISTS tax_number TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT;
