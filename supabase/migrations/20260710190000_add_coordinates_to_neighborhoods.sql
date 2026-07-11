-- Add latitude and longitude columns to neighborhoods table
ALTER TABLE public.neighborhoods 
ADD COLUMN latitude FLOAT8,
ADD COLUMN longitude FLOAT8;
