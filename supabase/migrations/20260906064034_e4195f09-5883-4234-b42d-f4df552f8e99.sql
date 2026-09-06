CREATE OR REPLACE FUNCTION public.sync_subject_teachers_on_course_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _subject text;
  _old_subject text;
  _still_enrolled boolean;
BEGIN
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT cp.subject INTO _subject FROM public.course_policies cp WHERE cp.id = NEW.course_policy_id;

    IF NEW.is_active AND NEW.teacher_id IS NOT NULL AND _subject IS NOT NULL THEN
      DELETE FROM public.student_subject_teachers
      WHERE student_id = NEW.student_id AND subject = _subject AND teacher_id <> NEW.teacher_id;

      INSERT INTO public.student_subject_teachers (student_id, subject, teacher_id)
      VALUES (NEW.student_id, _subject, NEW.teacher_id)
      ON CONFLICT (student_id, subject, teacher_id) DO NOTHING;
    END IF;
  END IF;

  -- Cleanup when a course is removed / deactivated / moved to another subject
  IF TG_OP = 'DELETE' THEN
    SELECT cp.subject INTO _old_subject FROM public.course_policies cp WHERE cp.id = OLD.course_policy_id;
  ELSIF TG_OP = 'UPDATE' AND (NOT NEW.is_active OR OLD.course_policy_id <> NEW.course_policy_id) THEN
    SELECT cp.subject INTO _old_subject FROM public.course_policies cp WHERE cp.id = OLD.course_policy_id;
  END IF;

  IF _old_subject IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.student_courses sc
      JOIN public.course_policies cp ON cp.id = sc.course_policy_id
      WHERE sc.student_id = OLD.student_id
        AND sc.is_active = true
        AND cp.subject = _old_subject
        AND sc.id <> OLD.id
    ) INTO _still_enrolled;

    IF NOT _still_enrolled THEN
      DELETE FROM public.student_subject_teachers
      WHERE student_id = OLD.student_id AND subject = _old_subject;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_subject_teachers_on_course_insert ON public.student_courses;
CREATE TRIGGER trg_sync_subject_teachers_on_course_insert
AFTER INSERT ON public.student_courses
FOR EACH ROW EXECUTE FUNCTION public.sync_subject_teachers_on_course_change();