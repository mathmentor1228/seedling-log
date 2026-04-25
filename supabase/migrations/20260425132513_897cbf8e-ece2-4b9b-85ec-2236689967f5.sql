CREATE TABLE IF NOT EXISTS public.exam_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  grade text NOT NULL,
  subject text NOT NULL,
  exam_type text NOT NULL,
  exam_year int NOT NULL,
  exam_period text NOT NULL,
  textbook text,
  exam_scope text,
  exam_difficulty text,
  avg_score double precision,
  overall_review text,
  original_pdf_path text,
  answer_pdf_path text,
  study_links jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT exam_analysis_reports_exam_difficulty_check
    CHECK (exam_difficulty IS NULL OR exam_difficulty IN ('매우쉬움','쉬움','중','어려움','매우어려움')),
  CONSTRAINT exam_analysis_reports_unique_key
    UNIQUE (school_name, grade, subject, exam_type, exam_year, exam_period)
);

CREATE TABLE IF NOT EXISTS public.exam_analysis_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.exam_analysis_reports(id) ON DELETE CASCADE,
  item_number int NOT NULL,
  item_type text,
  points double precision,
  difficulty text,
  note text,
  unit_name text,
  problem_desc text,
  source_type text,
  question_type text,
  classification text,
  content text,
  area text,
  sort_order int DEFAULT 0,
  CONSTRAINT exam_analysis_items_unique_key UNIQUE (report_id, item_number)
);

ALTER TABLE public.exam_analysis_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_analysis_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated staff can manage exam analysis reports" ON public.exam_analysis_reports;
CREATE POLICY "Authenticated staff can manage exam analysis reports"
ON public.exam_analysis_reports
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated staff can manage exam analysis items" ON public.exam_analysis_items;
CREATE POLICY "Authenticated staff can manage exam analysis items"
ON public.exam_analysis_items
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.update_exam_analysis_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_exam_analysis_reports_updated_at ON public.exam_analysis_reports;
CREATE TRIGGER update_exam_analysis_reports_updated_at
BEFORE UPDATE ON public.exam_analysis_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_exam_analysis_reports_updated_at();

CREATE INDEX IF NOT EXISTS idx_exam_analysis_reports_lookup
ON public.exam_analysis_reports (school_name, grade, subject, exam_year, exam_period);

CREATE INDEX IF NOT EXISTS idx_exam_analysis_items_report_sort
ON public.exam_analysis_items (report_id, sort_order, item_number);

INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-analysis', 'exam-analysis', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Authenticated staff can view exam analysis files" ON storage.objects;
CREATE POLICY "Authenticated staff can view exam analysis files"
ON storage.objects
FOR SELECT
TO authenticated
USING (bucket_id = 'exam-analysis');

DROP POLICY IF EXISTS "Authenticated staff can upload exam analysis files" ON storage.objects;
CREATE POLICY "Authenticated staff can upload exam analysis files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'exam-analysis');

DROP POLICY IF EXISTS "Authenticated staff can update exam analysis files" ON storage.objects;
CREATE POLICY "Authenticated staff can update exam analysis files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (bucket_id = 'exam-analysis')
WITH CHECK (bucket_id = 'exam-analysis');

DROP POLICY IF EXISTS "Authenticated staff can delete exam analysis files" ON storage.objects;
CREATE POLICY "Authenticated staff can delete exam analysis files"
ON storage.objects
FOR DELETE
TO authenticated
USING (bucket_id = 'exam-analysis');