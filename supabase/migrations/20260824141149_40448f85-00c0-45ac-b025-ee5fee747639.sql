CREATE OR REPLACE FUNCTION public.block_retired_teacher_lesson_records()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _class_teacher uuid;
  _retired boolean := false;
BEGIN
  -- 과거 기록 보정/백필은 그대로 허용
  IF NEW.lesson_date IS NULL OR NEW.lesson_date < DATE '2026-08-24' THEN
    RETURN NEW;
  END IF;

  IF NEW.class_id IS NOT NULL THEN
    SELECT c.teacher_id INTO _class_teacher FROM public.classes c WHERE c.id = NEW.class_id;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id IN (_class_teacher, NEW.teacher_id)
      AND p.is_active = false
  ) INTO _retired;

  IF _retired THEN
    RETURN NULL; -- 조용히 생성하지 않음
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_block_retired_teacher_lesson_records ON public.lesson_records;
CREATE TRIGGER trg_block_retired_teacher_lesson_records
BEFORE INSERT ON public.lesson_records
FOR EACH ROW EXECUTE FUNCTION public.block_retired_teacher_lesson_records();