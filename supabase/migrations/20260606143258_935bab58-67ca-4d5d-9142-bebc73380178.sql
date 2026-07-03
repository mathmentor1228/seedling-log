
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

-- 기존 퇴원생에 대해 updated_at을 backfill (없는 경우)
UPDATE public.students
SET withdrawn_at = COALESCE(updated_at, now())
WHERE enrollment_status = '퇴원' AND withdrawn_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_student_withdrawn_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.enrollment_status = '퇴원' THEN
    IF OLD.enrollment_status IS DISTINCT FROM '퇴원' OR NEW.withdrawn_at IS NULL THEN
      NEW.withdrawn_at := COALESCE(NEW.withdrawn_at, now());
    END IF;
  ELSE
    -- 활성 상태로 복귀하면 withdrawn_at 초기화
    NEW.withdrawn_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_student_withdrawn_at ON public.students;
CREATE TRIGGER trg_sync_student_withdrawn_at
BEFORE INSERT OR UPDATE OF enrollment_status ON public.students
FOR EACH ROW EXECUTE FUNCTION public.sync_student_withdrawn_at();
