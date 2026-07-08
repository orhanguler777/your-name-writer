
CREATE POLICY "attachments_bucket_read" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'complaint-attachments');
CREATE POLICY "attachments_bucket_insert" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'complaint-attachments');
CREATE POLICY "attachments_bucket_public_read" ON storage.objects FOR SELECT TO anon
USING (bucket_id = 'complaint-attachments');
