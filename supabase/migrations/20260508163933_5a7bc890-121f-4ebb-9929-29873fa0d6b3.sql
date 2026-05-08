
ALTER TABLE public.exam_reviews
  ADD COLUMN IF NOT EXISTS is_published boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS published_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS published_by_name text;

CREATE INDEX IF NOT EXISTS idx_exam_reviews_is_published
  ON public.exam_reviews (is_published) WHERE is_published = true;

-- Trigger: only admin (원장) may toggle is_published
CREATE OR REPLACE FUNCTION public.guard_exam_review_publish()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.is_published IS TRUE AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION '원장만 시험지 리뷰를 공개할 수 있습니다.';
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (NEW.is_published IS DISTINCT FROM OLD.is_published)
       AND NOT public.has_role(auth.uid(), 'admin') THEN
      RAISE EXCEPTION '원장만 시험지 리뷰의 공개 권한을 변경할 수 있습니다.';
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_exam_review_publish ON public.exam_reviews;
CREATE TRIGGER trg_guard_exam_review_publish
BEFORE INSERT OR UPDATE ON public.exam_reviews
FOR EACH ROW EXECUTE FUNCTION public.guard_exam_review_publish();
