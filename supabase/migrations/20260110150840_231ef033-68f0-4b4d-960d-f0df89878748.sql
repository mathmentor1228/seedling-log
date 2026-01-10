-- LESSON-VIEW-LOCK-V1: Hard-stop submitted->draft regression at database level

-- 1. Create trigger function to protect submitted lessons
CREATE OR REPLACE FUNCTION public.protect_submitted_lesson_records()
RETURNS TRIGGER AS $$
BEGIN
  -- Guard 1: Prevent status downgrade from 'submitted' to anything else
  -- Check using the 'submitted' boolean column (true = submitted, false = draft)
  IF OLD.submitted = true AND NEW.submitted = false THEN
    -- Force status to remain submitted
    NEW.submitted := true;
    RAISE WARNING '[LESSON-VIEW-LOCK-V1] Blocked status downgrade from submitted to draft for lesson_record %', OLD.id;
  END IF;

  -- Guard 2: Protect teacher_id from being overwritten
  -- Keep original teacher_id if someone tries to null it or change it
  IF OLD.teacher_id IS NOT NULL AND (NEW.teacher_id IS NULL OR NEW.teacher_id <> OLD.teacher_id) THEN
    -- Preserve the original teacher_id
    NEW.teacher_id := OLD.teacher_id;
    RAISE WARNING '[LESSON-VIEW-LOCK-V1] Blocked teacher_id change for lesson_record %', OLD.id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 2. Create the trigger
DROP TRIGGER IF EXISTS protect_submitted_lesson_records_trigger ON public.lesson_records;

CREATE TRIGGER protect_submitted_lesson_records_trigger
  BEFORE UPDATE ON public.lesson_records
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_submitted_lesson_records();

-- Add comment for documentation
COMMENT ON FUNCTION public.protect_submitted_lesson_records() IS 'LESSON-VIEW-LOCK-V1: Prevents submitted lessons from being downgraded to draft and protects teacher_id from accidental overwrites';