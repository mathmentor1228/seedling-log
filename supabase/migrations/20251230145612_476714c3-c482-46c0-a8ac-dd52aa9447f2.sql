ALTER TABLE public.lesson_records
  ADD COLUMN IF NOT EXISTS submitted BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS draft_created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 기존 데이터는 이미 작성된 기록으로 간주
UPDATE public.lesson_records
SET submitted = true,
    submitted_at = COALESCE(submitted_at, created_at)
WHERE submitted IS DISTINCT FROM true;