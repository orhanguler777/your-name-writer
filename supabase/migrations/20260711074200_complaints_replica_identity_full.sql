-- Enable FULL replica identity on complaints table so Supabase Realtime
-- sends both old and new row data on UPDATE events.
-- This is required for the WhatsApp bot to detect status changes.
ALTER TABLE public.complaints REPLICA IDENTITY FULL;
