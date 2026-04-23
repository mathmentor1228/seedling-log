CREATE TABLE IF NOT EXISTS public.exam_score_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  subject text NOT NULL,
  grade text NOT NULL,
  exam_type text NOT NULL,
  exam_year integer NOT NULL,
  exam_period text NOT NULL,
  total_items integer NOT NULL DEFAULT 20,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_types jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exam_score_templates_unique_key UNIQUE (school_name, subject, grade, exam_type, exam_year, exam_period)
);

ALTER TABLE public.exam_score_templates ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.exam_item_reviews
  ADD COLUMN IF NOT EXISTS score_earned double precision DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_essay boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS custom_reason text,
  ADD COLUMN IF NOT EXISTS overlay_x double precision,
  ADD COLUMN IF NOT EXISTS overlay_y double precision,
  ADD COLUMN IF NOT EXISTS page_number integer DEFAULT 1;

ALTER TABLE public.exam_reviews
  ADD COLUMN IF NOT EXISTS total_score double precision,
  ADD COLUMN IF NOT EXISTS earned_score double precision,
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES public.exam_score_templates(id);

DROP POLICY IF EXISTS "Staff can read score templates" ON public.exam_score_templates;
DROP POLICY IF EXISTS "Staff can create score templates" ON public.exam_score_templates;
DROP POLICY IF EXISTS "Staff can update score templates" ON public.exam_score_templates;
DROP POLICY IF EXISTS "Staff can delete score templates" ON public.exam_score_templates;
DROP POLICY IF EXISTS "auth read" ON public.exam_score_templates;
DROP POLICY IF EXISTS "auth write" ON public.exam_score_templates;

CREATE POLICY "Staff can read score templates"
ON public.exam_score_templates
FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff can create score templates"
ON public.exam_score_templates
FOR INSERT
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
  AND (created_by IS NULL OR created_by = auth.uid())
);

CREATE POLICY "Staff can update score templates"
ON public.exam_score_templates
FOR UPDATE
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
  AND (created_by IS NULL OR created_by = auth.uid())
);

CREATE POLICY "Staff can delete score templates"
ON public.exam_score_templates
FOR DELETE
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE INDEX IF NOT EXISTS idx_exam_score_templates_lookup
ON public.exam_score_templates (school_name, subject, grade, exam_type, exam_year, exam_period);

CREATE INDEX IF NOT EXISTS idx_exam_reviews_template_id
ON public.exam_reviews (template_id);

CREATE INDEX IF NOT EXISTS idx_exam_item_reviews_page_number
ON public.exam_item_reviews (review_id, page_number, item_number);