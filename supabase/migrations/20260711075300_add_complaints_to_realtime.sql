-- Add complaints table to Supabase Realtime publication
-- This is required for the WhatsApp bot to receive UPDATE events
ALTER PUBLICATION supabase_realtime ADD TABLE public.complaints;
