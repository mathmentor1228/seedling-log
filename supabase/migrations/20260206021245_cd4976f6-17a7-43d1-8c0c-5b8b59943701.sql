
-- Create homework-submissions storage bucket if not exists
INSERT INTO storage.buckets (id, name, public)
VALUES ('homework-submissions', 'homework-submissions', true)
ON CONFLICT (id) DO NOTHING;

-- Allow students to upload (via service role, but also allow anon for direct uploads)
CREATE POLICY "Anyone can view homework submissions files"
ON storage.objects FOR SELECT
USING (bucket_id = 'homework-submissions');

CREATE POLICY "Anyone can upload homework submissions files"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'homework-submissions');

CREATE POLICY "Anyone can delete own homework submissions files"
ON storage.objects FOR DELETE
USING (bucket_id = 'homework-submissions');
