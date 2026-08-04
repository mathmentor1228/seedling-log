
CREATE OR REPLACE FUNCTION public.remove_student_from_schedules(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  new_ids jsonb;
  new_names jsonb;
  idx int;
BEGIN
  FOR r IN
    SELECT id, student_ids, student_names
    FROM public.room_assignments
    WHERE student_ids @> to_jsonb(_student_id::text)
  LOOP
    new_ids := '[]'::jsonb;
    new_names := '[]'::jsonb;
    FOR idx IN 0 .. (jsonb_array_length(COALESCE(r.student_ids, '[]'::jsonb)) - 1) LOOP
      IF (r.student_ids -> idx) #>> '{}' IS DISTINCT FROM _student_id::text THEN
        new_ids := new_ids || jsonb_build_array(r.student_ids -> idx);
        IF r.student_names IS NOT NULL AND jsonb_array_length(r.student_names) > idx THEN
          new_names := new_names || jsonb_build_array(r.student_names -> idx);
        END IF;
      END IF;
    END LOOP;

    IF jsonb_array_length(new_ids) = 0 THEN
      DELETE FROM public.room_assignments WHERE id = r.id;
    ELSE
      UPDATE public.room_assignments
      SET student_ids = new_ids, student_names = new_names, updated_at = now()
      WHERE id = r.id;
    END IF;
  END LOOP;

  DELETE FROM public.room_assignments WHERE student_id = _student_id;
  DELETE FROM public.class_students WHERE student_id = _student_id;
  DELETE FROM public.student_group_members WHERE student_id = _student_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cleanup_schedules_on_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.enrollment_status IN ('퇴원', '휴학')
     AND COALESCE(OLD.enrollment_status, '') IS DISTINCT FROM NEW.enrollment_status THEN
    PERFORM public.remove_student_from_schedules(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_schedules_on_withdrawal ON public.students;
CREATE TRIGGER trg_cleanup_schedules_on_withdrawal
AFTER UPDATE OF enrollment_status ON public.students
FOR EACH ROW
EXECUTE FUNCTION public.cleanup_schedules_on_withdrawal();

DO $$
DECLARE s RECORD;
BEGIN
  FOR s IN SELECT id FROM public.students WHERE enrollment_status IN ('퇴원', '휴학') LOOP
    PERFORM public.remove_student_from_schedules(s.id);
  END LOOP;
END $$;
