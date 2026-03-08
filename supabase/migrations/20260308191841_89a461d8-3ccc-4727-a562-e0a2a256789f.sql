-- Allow anonymous uploads to quiz-submissions bucket for student app
CREATE POLICY "Anyone can upload quiz submissions"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'quiz-submissions');

CREATE POLICY "Anyone can read quiz submissions"
ON storage.objects FOR SELECT
USING (bucket_id = 'quiz-submissions');