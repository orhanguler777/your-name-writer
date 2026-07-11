-- Add mukhtar columns to neighborhoods table
ALTER TABLE public.neighborhoods 
ADD COLUMN mukhtar_name TEXT,
ADD COLUMN mukhtar_phone TEXT;
