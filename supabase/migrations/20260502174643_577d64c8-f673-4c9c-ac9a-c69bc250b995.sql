-- 1) Add columns to exam_analysis_reports
ALTER TABLE public.exam_analysis_reports
  ADD COLUMN IF NOT EXISTS card_image_paths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS student_message text,
  ADD COLUMN IF NOT EXISTS parent_message text,
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_exam_analysis_reports_published
  ON public.exam_analysis_reports (is_published, school_name, grade, subject)
  WHERE is_published = true;

-- 2) Views log table
CREATE TABLE IF NOT EXISTS public.exam_analysis_report_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.exam_analysis_reports(id) ON DELETE CASCADE,
  viewer_type text NOT NULL CHECK (viewer_type IN ('student', 'parent')),
  student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  viewed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exam_analysis_report_views_report
  ON public.exam_analysis_report_views (report_id, viewed_at DESC);
CREATE INDEX IF NOT EXISTS idx_exam_analysis_report_views_student
  ON public.exam_analysis_report_views (student_id, report_id);

ALTER TABLE public.exam_analysis_report_views ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can log a view" ON public.exam_analysis_report_views;
CREATE POLICY "Anyone can log a view"
  ON public.exam_analysis_report_views
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "Staff can view view logs" ON public.exam_analysis_report_views;
CREATE POLICY "Staff can view view logs"
  ON public.exam_analysis_report_views
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role) OR
    has_role(auth.uid(), 'teacher'::app_role) OR
    has_role(auth.uid(), 'assistant'::app_role)
  );

-- 3) Helper: school_level + grade_year -> grade label like '고1','중2'
CREATE OR REPLACE FUNCTION public.format_student_grade_label(_school_level text, _grade_year integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN _school_level IS NULL OR _grade_year IS NULL THEN NULL
    ELSE _school_level || _grade_year::text
  END;
$$;

-- 4) Helper: get analysis reports for a student (matches school + grade + subjects student takes)
CREATE OR REPLACE FUNCTION public.get_published_analysis_for_student(_student_id uuid)
RETURNS SETOF public.exam_analysis_reports
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _school text;
  _grade_label text;
BEGIN
  SELECT s.school,
         public.format_student_grade_label(s.school_level, s.grade_year)
  INTO _school, _grade_label
  FROM public.students s
  WHERE s.id = _student_id;

  IF _school IS NULL OR _grade_label IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.exam_analysis_reports r
  WHERE r.is_published = true
    AND (r.published_at IS NULL OR r.published_at <= now())
    AND r.school_name = _school
    AND r.grade = _grade_label
    AND EXISTS (
      SELECT 1
      FROM public.class_students cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE cs.student_id = _student_id
        AND c.subject::text = r.subject
    )
  ORDER BY COALESCE(r.published_at, r.updated_at) DESC;
END;
$$;

-- 5) Helper: get analysis reports for a parent token (single child)
CREATE OR REPLACE FUNCTION public.get_published_analysis_for_parent_token(_parent_token text)
RETURNS SETOF public.exam_analysis_reports
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student_id uuid;
BEGIN
  SELECT id INTO _student_id
  FROM public.students
  WHERE parent_token = _parent_token
  LIMIT 1;

  IF _student_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY SELECT * FROM public.get_published_analysis_for_student(_student_id);
END;
$$;

-- 6) Allow students/parents to read published reports via direct table query as well (fallback)
DROP POLICY IF EXISTS "Public can view published analysis reports" ON public.exam_analysis_reports;
CREATE POLICY "Public can view published analysis reports"
  ON public.exam_analysis_reports
  FOR SELECT
  TO anon, authenticated
  USING (
    is_published = true
    AND (published_at IS NULL OR published_at <= now())
  );