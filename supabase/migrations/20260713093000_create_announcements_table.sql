-- Create announcements table
CREATE TABLE IF NOT EXISTS public.announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    file_url TEXT,
    file_type TEXT,
    start_date DATE,
    end_date DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;

-- Create policy to allow read access to everyone
CREATE POLICY "Allow read announcements to everyone" ON public.announcements
    FOR SELECT USING (true);

-- Create policy to allow write access to authenticated users
CREATE POLICY "Allow write announcements to authenticated" ON public.announcements
    FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Create bucket for announcements if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('announcements', 'announcements', true)
ON CONFLICT (id) DO NOTHING;

-- Policies for announcements bucket
CREATE POLICY "announcements_bucket_read" ON storage.objects FOR SELECT USING (bucket_id = 'announcements');
CREATE POLICY "announcements_bucket_insert" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'announcements');
CREATE POLICY "announcements_bucket_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'announcements');
