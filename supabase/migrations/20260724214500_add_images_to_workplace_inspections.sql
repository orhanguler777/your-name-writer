-- Add images array column to workplace_inspections
ALTER TABLE public.workplace_inspections
  ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}'::text[];
