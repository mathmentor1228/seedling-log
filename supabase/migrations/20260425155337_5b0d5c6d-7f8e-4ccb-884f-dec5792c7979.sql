ALTER TABLE public.exam_score_templates
  ADD COLUMN IF NOT EXISTS answer_mode text DEFAULT 'direct',
  ADD COLUMN IF NOT EXISTS answers jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS answer_image_paths jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS answer_pdf_path text;

UPDATE public.exam_score_templates
SET
  answer_mode = COALESCE(answer_mode, 'direct'),
  answers = COALESCE(answers, '{}'::jsonb),
  answer_image_paths = COALESCE(answer_image_paths, '[]'::jsonb)
WHERE answer_mode IS NULL
   OR answers IS NULL
   OR answer_image_paths IS NULL;