
-- Parent announcement templates table
CREATE TABLE public.parent_announcement_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL DEFAULT '일반',
  body text NOT NULL,
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  sort_order int NOT NULL DEFAULT 0
);

ALTER TABLE public.parent_announcement_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage templates" ON public.parent_announcement_templates
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'teacher', 'assistant'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'teacher', 'assistant'))
  );

-- Add subtitle column to math_concept_quizzes for auto-generated subtitle
ALTER TABLE public.math_concept_quizzes ADD COLUMN IF NOT EXISTS subtitle text;
