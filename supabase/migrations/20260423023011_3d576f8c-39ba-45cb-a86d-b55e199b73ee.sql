ALTER TABLE public.student_exam_results
  ADD COLUMN IF NOT EXISTS review_status text
    DEFAULT 'pending'
    CHECK (review_status IN ('pending','in_review','done'));

CREATE TABLE IF NOT EXISTS public.exam_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.student_exam_results(id) ON DELETE CASCADE,
  reviewed_by uuid REFERENCES public.profiles(id),
  reviewed_by_name text,
  overall_comment text,
  reviewed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_item_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.exam_reviews(id) ON DELETE CASCADE,
  item_number int NOT NULL,
  result text CHECK (result IN ('correct','wrong','partial')),
  error_types jsonb DEFAULT '[]',
  item_comment text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.exam_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_item_reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read" ON public.exam_reviews;
CREATE POLICY "authenticated read" ON public.exam_reviews
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated write" ON public.exam_reviews;
CREATE POLICY "authenticated write" ON public.exam_reviews
  FOR ALL USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated read items" ON public.exam_item_reviews;
CREATE POLICY "authenticated read items" ON public.exam_item_reviews
  FOR SELECT USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "authenticated write items" ON public.exam_item_reviews;
CREATE POLICY "authenticated write items" ON public.exam_item_reviews
  FOR ALL USING (auth.role() = 'authenticated');

CREATE INDEX IF NOT EXISTS idx_exam_reviews_result_id ON public.exam_reviews(result_id);
CREATE INDEX IF NOT EXISTS idx_exam_item_reviews_review_id ON public.exam_item_reviews(review_id);