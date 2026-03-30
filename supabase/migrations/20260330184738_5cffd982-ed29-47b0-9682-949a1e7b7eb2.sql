
-- Create storage bucket for math question photos
INSERT INTO storage.buckets (id, name, public) VALUES ('math-questions', 'math-questions', true);

-- Storage policies for math-questions bucket
CREATE POLICY "Anyone can view math question photos" ON storage.objects
  FOR SELECT USING (bucket_id = 'math-questions');

CREATE POLICY "Authenticated users can upload math question photos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'math-questions');

CREATE POLICY "Authenticated users can update math question photos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'math-questions');
