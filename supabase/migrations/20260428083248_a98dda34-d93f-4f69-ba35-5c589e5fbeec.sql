CREATE TABLE IF NOT EXISTS public.exam_deep_analysis_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_report_id uuid NOT NULL REFERENCES public.exam_analysis_reports(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft',
  overall_insights text,
  difficult_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  score_band_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  student_recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  teacher_notes text,
  generated_by uuid,
  reviewed_by uuid,
  published_by uuid,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_deep_analysis_reports_status_check CHECK (status IN ('draft', 'published')),
  CONSTRAINT exam_deep_analysis_reports_analysis_unique UNIQUE (analysis_report_id)
);

ALTER TABLE public.exam_deep_analysis_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Staff can view deep exam analysis" ON public.exam_deep_analysis_reports;
CREATE POLICY "Staff can view deep exam analysis"
ON public.exam_deep_analysis_reports
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Staff can create deep exam analysis" ON public.exam_deep_analysis_reports;
CREATE POLICY "Staff can create deep exam analysis"
ON public.exam_deep_analysis_reports
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Staff can update deep exam analysis" ON public.exam_deep_analysis_reports;
CREATE POLICY "Staff can update deep exam analysis"
ON public.exam_deep_analysis_reports
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Staff can delete deep exam analysis" ON public.exam_deep_analysis_reports;
CREATE POLICY "Staff can delete deep exam analysis"
ON public.exam_deep_analysis_reports
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE OR REPLACE FUNCTION public.update_exam_deep_analysis_reports_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS update_exam_deep_analysis_reports_updated_at ON public.exam_deep_analysis_reports;
CREATE TRIGGER update_exam_deep_analysis_reports_updated_at
BEFORE UPDATE ON public.exam_deep_analysis_reports
FOR EACH ROW
EXECUTE FUNCTION public.update_exam_deep_analysis_reports_updated_at();

CREATE INDEX IF NOT EXISTS idx_exam_deep_analysis_reports_analysis
ON public.exam_deep_analysis_reports (analysis_report_id, status);

CREATE INDEX IF NOT EXISTS idx_exam_deep_analysis_reports_published
ON public.exam_deep_analysis_reports (status, published_at DESC);