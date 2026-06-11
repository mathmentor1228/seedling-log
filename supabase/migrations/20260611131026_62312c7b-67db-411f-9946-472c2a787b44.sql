-- ATT-SYNC-V1: When a student is checked in via attendance_logs, automatically
-- mark today's lesson_records (for that student's classes on this DOW) as 정상등원
-- if no attendance_status has been set yet. Does NOT override manual tags.

CREATE OR REPLACE FUNCTION public.sync_attendance_to_lesson_record()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dow int;
  rec record;
  existing_id uuid;
  existing_status text[];
BEGIN
  IF NEW.checked_in_at IS NULL THEN
    RETURN NEW;
  END IF;

  -- Postgres EXTRACT(DOW) → 0=Sunday..6=Saturday (matches app convention)
  dow := EXTRACT(DOW FROM NEW.date)::int;

  FOR rec IN
    SELECT DISTINCT cs.class_id, cs.teacher_id, c.subject
    FROM public.class_schedules cs
    JOIN public.classes c ON c.id = cs.class_id
    JOIN public.class_students cst ON cst.class_id = cs.class_id
    WHERE cst.student_id = NEW.student_id
      AND cs.day_of_week = dow
      AND cs.is_active = true
  LOOP
    SELECT id, attendance_status
      INTO existing_id, existing_status
    FROM public.lesson_records
    WHERE student_id = NEW.student_id
      AND class_id = rec.class_id
      AND lesson_date = NEW.date
    LIMIT 1;

    IF existing_id IS NULL THEN
      INSERT INTO public.lesson_records (
        teacher_id, student_id, class_id, subject, lesson_date, lesson_range,
        homework_status, test_result, attendance_status, submitted
      ) VALUES (
        rec.teacher_id, NEW.student_id, rec.class_id, rec.subject, NEW.date, '',
        'none_assigned', 'unable_to_verify', ARRAY['정상등원']::text[], false
      );
    ELSIF existing_status IS NULL OR array_length(existing_status, 1) IS NULL THEN
      UPDATE public.lesson_records
      SET attendance_status = ARRAY['정상등원']::text[],
          updated_at = now()
      WHERE id = existing_id;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_attendance_to_lesson_record ON public.attendance_logs;
CREATE TRIGGER trg_sync_attendance_to_lesson_record
AFTER INSERT OR UPDATE OF checked_in_at ON public.attendance_logs
FOR EACH ROW
EXECUTE FUNCTION public.sync_attendance_to_lesson_record();