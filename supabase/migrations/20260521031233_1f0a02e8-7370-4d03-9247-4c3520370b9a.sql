
-- 1. Add grading_strictness to vocab_generated_tests
ALTER TABLE public.vocab_generated_tests
  ADD COLUMN IF NOT EXISTS grading_strictness text NOT NULL DEFAULT 'normal';

-- Update validation trigger
CREATE OR REPLACE FUNCTION public.validate_vocab_generated_tests_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.test_mode NOT IN ('ko', 'en') THEN
    RAISE EXCEPTION 'test_mode must be ko or en';
  END IF;
  IF NEW.question_type NOT IN ('multiple_choice', 'typing') THEN
    RAISE EXCEPTION 'question_type must be multiple_choice or typing';
  END IF;
  IF NEW.grading_strictness NOT IN ('strict','normal','lenient') THEN
    RAISE EXCEPTION 'grading_strictness must be strict, normal, or lenient';
  END IF;
  RETURN NEW;
END;
$function$;

-- 2. Create vocab_test_submissions table
CREATE TABLE IF NOT EXISTS public.vocab_test_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  test_id uuid NOT NULL REFERENCES public.vocab_generated_tests(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  answers jsonb NOT NULL DEFAULT '[]'::jsonb,
  auto_score integer NOT NULL DEFAULT 0,
  final_score integer NOT NULL DEFAULT 0,
  total integer NOT NULL DEFAULT 0,
  strictness_used text NOT NULL DEFAULT 'normal',
  submission_type text NOT NULL DEFAULT 'typing',
  image_urls text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'graded',
  corrected_by uuid,
  corrected_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vts_test ON public.vocab_test_submissions(test_id);
CREATE INDEX IF NOT EXISTS idx_vts_student ON public.vocab_test_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_vts_created ON public.vocab_test_submissions(created_at DESC);

ALTER TABLE public.vocab_test_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read vocab submissions"
ON public.vocab_test_submissions FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff can update vocab submissions"
ON public.vocab_test_submissions FOR UPDATE
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

CREATE POLICY "Staff can delete vocab submissions"
ON public.vocab_test_submissions FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
);

-- updated_at trigger
CREATE TRIGGER trg_vts_updated_at
BEFORE UPDATE ON public.vocab_test_submissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Storage bucket for submission images
INSERT INTO storage.buckets (id, name, public)
VALUES ('vocab-submissions', 'vocab-submissions', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read vocab-submissions"
ON storage.objects FOR SELECT
USING (bucket_id = 'vocab-submissions');

CREATE POLICY "Anyone can upload vocab-submissions"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'vocab-submissions');

CREATE POLICY "Staff can delete vocab-submissions"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'vocab-submissions'
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
);
