CREATE OR REPLACE FUNCTION public.sync_attendance_to_lesson_record()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  dow int;
  rec record;
  existing_id uuid;
  existing_status text[];
BEGIN
  IF NEW.checked_in_at IS NULL THEN
    RETURN NEW;
  END IF;

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
        'none_assigned', 'none', ARRAY['정상등원']::text[], false
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
$function$;

REVOKE ALL ON FUNCTION public.sync_attendance_to_lesson_record() FROM PUBLIC, anon, authenticated;