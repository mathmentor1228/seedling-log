CREATE OR REPLACE FUNCTION public.sync_subject_teachers_on_course_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _student_id uuid;
  _subject text;
  _still_enrolled boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    _student_id := OLD.student_id;
    SELECT cp.subject INTO _subject FROM public.course_policies cp WHERE cp.id = OLD.course_policy_id;
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only react when active flag turned off or policy changed
    IF NEW.is_active = true AND OLD.course_policy_id = NEW.course_policy_id THEN
      RETURN NEW;
    END IF;
    _student_id := OLD.student_id;
    SELECT cp.subject INTO _subject FROM public.course_policies cp WHERE cp.id = OLD.course_policy_id;
  END IF;

  IF _subject IS NULL OR _student_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.student_courses sc
    JOIN public.course_policies cp ON cp.id = sc.course_policy_id
    WHERE sc.student_id = _student_id
      AND sc.is_active = true
      AND cp.subject = _subject
      AND (TG_OP = 'DELETE' OR sc.id <> OLD.id)
  ) INTO _still_enrolled;

  IF NOT _still_enrolled THEN
    DELETE FROM public.student_subject_teachers
    WHERE student_id = _student_id AND subject = _subject;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_subject_teachers_on_course_delete ON public.student_courses;
DROP TRIGGER IF EXISTS trg_sync_subject_teachers_on_course_update ON public.student_courses;

CREATE TRIGGER trg_sync_subject_teachers_on_course_delete
AFTER DELETE ON public.student_courses
FOR EACH ROW EXECUTE FUNCTION public.sync_subject_teachers_on_course_change();

CREATE TRIGGER trg_sync_subject_teachers_on_course_update
AFTER UPDATE ON public.student_courses
FOR EACH ROW EXECUTE FUNCTION public.sync_subject_teachers_on_course_change();