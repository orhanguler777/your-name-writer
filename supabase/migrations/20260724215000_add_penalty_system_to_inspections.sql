-- Add penalty_points and recommended_action to workplace_inspections
ALTER TABLE public.workplace_inspections
  ADD COLUMN IF NOT EXISTS penalty_points INT4 DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recommended_action TEXT DEFAULT 'Uygun';
