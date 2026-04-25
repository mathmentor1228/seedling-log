ALTER TABLE public.exam_analysis_reports
  ADD COLUMN IF NOT EXISTS answer_mode text DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS answers jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS answer_image_paths jsonb DEFAULT '[]'::jsonb;