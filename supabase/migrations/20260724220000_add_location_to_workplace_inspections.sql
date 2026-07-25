-- Add latitude and longitude columns to workplace_inspections table for GPS verification
ALTER TABLE public.workplace_inspections
  ADD COLUMN IF NOT EXISTS latitude FLOAT8,
  ADD COLUMN IF NOT EXISTS longitude FLOAT8;
