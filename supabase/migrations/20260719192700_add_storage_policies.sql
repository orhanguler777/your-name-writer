-- Enable insert on storage.objects for authenticated users in attachments bucket
CREATE POLICY "Give users authenticated insert access to attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'attachments'
);

CREATE POLICY "Give users authenticated select access to attachments"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'attachments'
);
