-- Add sent_at column to track broadcast status
ALTER TABLE public.announcements ADD COLUMN IF NOT EXISTS sent_at TIMESTAMP WITH TIME ZONE;
