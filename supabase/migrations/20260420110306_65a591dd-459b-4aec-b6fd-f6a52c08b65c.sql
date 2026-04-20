-- Extend student_exam_results
ALTER TABLE public.student_exam_results
  ADD COLUMN IF NOT EXISTS exam_year INTEGER,
  ADD COLUMN IF NOT EXISTS exam_period TEXT,
  ADD COLUMN IF NOT EXISTS score_locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS actual_score NUMERIC,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS locked_by UUID,
  ADD COLUMN IF NOT EXISTS uploaded_by_staff UUID,
  ADD COLUMN IF NOT EXISTS uploaded_by_staff_name TEXT,
  ADD COLUMN IF NOT EXISTS is_staff_upload BOOLEAN NOT NULL DEFAULT false;

-- New table for generated PDFs
CREATE TABLE IF NOT EXISTS public.student_exam_result_pdfs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.student_exam_results(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  display_title TEXT NOT NULL,
  file_size BIGINT,
  page_count INTEGER,
  generated_by UUID,
  generated_by_name TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_result_pdfs_result ON public.student_exam_result_pdfs(result_id);

ALTER TABLE public.student_exam_result_pdfs ENABLE ROW LEVEL SECURITY;

-- All staff (admin/teacher/assistant) can view, create, delete PDFs
DROP POLICY IF EXISTS "Staff can view exam result pdfs" ON public.student_exam_result_pdfs;
CREATE POLICY "Staff can view exam result pdfs"
  ON public.student_exam_result_pdfs FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

DROP POLICY IF EXISTS "Staff can create exam result pdfs" ON public.student_exam_result_pdfs;
CREATE POLICY "Staff can create exam result pdfs"
  ON public.student_exam_result_pdfs FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

DROP POLICY IF EXISTS "Staff can delete exam result pdfs" ON public.student_exam_result_pdfs;
CREATE POLICY "Staff can delete exam result pdfs"
  ON public.student_exam_result_pdfs FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- Allow staff to UPDATE student_exam_results (for editing/locking)
DROP POLICY IF EXISTS "Staff can update exam results" ON public.student_exam_results;
CREATE POLICY "Staff can update exam results"
  ON public.student_exam_results FOR UPDATE
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- Allow staff to INSERT exam results (for staff uploads)
DROP POLICY IF EXISTS "Staff can create exam results" ON public.student_exam_results;
CREATE POLICY "Staff can create exam results"
  ON public.student_exam_results FOR INSERT
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- Allow staff to DELETE exam results
DROP POLICY IF EXISTS "Staff can delete exam results" ON public.student_exam_results;
CREATE POLICY "Staff can delete exam results"
  ON public.student_exam_results FOR DELETE
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- Update validation trigger to allow actual_score range
CREATE OR REPLACE FUNCTION public.validate_student_exam_result()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.exam_type NOT IN ('midterm','final','performance','other') THEN
    RAISE EXCEPTION 'Invalid exam_type: %', NEW.exam_type;
  END IF;
  IF NEW.expected_score IS NOT NULL AND (NEW.expected_score < 0 OR NEW.expected_score > 100) THEN
    RAISE EXCEPTION 'expected_score must be between 0 and 100';
  END IF;
  IF NEW.actual_score IS NOT NULL AND (NEW.actual_score < 0 OR NEW.actual_score > 100) THEN
    RAISE EXCEPTION 'actual_score must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$function$;