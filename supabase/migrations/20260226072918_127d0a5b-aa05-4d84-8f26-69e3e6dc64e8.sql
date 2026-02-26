
-- Create exam subject details table for per-subject exam info within a school exam event
CREATE TABLE public.exam_subject_details (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.academy_events(id) ON DELETE CASCADE,
  subject_name TEXT NOT NULL,
  exam_date DATE NULL,
  exam_time TEXT NULL,
  exam_scope TEXT NULL,
  paper_storage_path TEXT NULL,
  paper_original_name TEXT NULL,
  paper_mime_type TEXT NULL,
  paper_file_size INTEGER NULL,
  uploaded_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, subject_name)
);

-- Enable RLS
ALTER TABLE public.exam_subject_details ENABLE ROW LEVEL SECURITY;

-- Admins can do all
CREATE POLICY "Admins can do all on exam_subject_details"
  ON public.exam_subject_details
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Assistants can do all
CREATE POLICY "Assistants can do all on exam_subject_details"
  ON public.exam_subject_details
  FOR ALL
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

-- Teachers can view
CREATE POLICY "Teachers can view exam_subject_details"
  ON public.exam_subject_details
  FOR SELECT
  USING (has_role(auth.uid(), 'teacher'::app_role));

-- Teachers can insert/update (for uploading exam papers)
CREATE POLICY "Teachers can insert exam_subject_details"
  ON public.exam_subject_details
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Teachers can update exam_subject_details"
  ON public.exam_subject_details
  FOR UPDATE
  USING (has_role(auth.uid(), 'teacher'::app_role));

-- Create storage bucket for exam papers
INSERT INTO storage.buckets (id, name, public) VALUES ('exam-papers', 'exam-papers', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for exam papers
CREATE POLICY "Authenticated users can view exam papers"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'exam-papers' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upload exam papers"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'exam-papers' AND auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete exam papers"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'exam-papers' AND auth.role() = 'authenticated');
