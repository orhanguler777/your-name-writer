-- Add followup_date and followup_status to workplace_inspections for automated re-inspection tracking
ALTER TABLE public.workplace_inspections
  ADD COLUMN IF NOT EXISTS followup_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS followup_status TEXT DEFAULT 'none';
