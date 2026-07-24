-- Add complaint_responses and announcements to Supabase Realtime publication
-- This is required for the WhatsApp bot to receive INSERT and UPDATE events for these tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.complaint_responses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
