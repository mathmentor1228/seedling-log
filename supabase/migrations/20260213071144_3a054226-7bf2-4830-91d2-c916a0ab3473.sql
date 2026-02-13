-- Fix teacher_owns_student to check all teacher-student relationships, not just lesson_records
CREATE OR REPLACE FUNCTION public.teacher_owns_student(_teacher_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.student_subject_teachers
    WHERE teacher_id = _teacher_id AND student_id = _student_id
  )
  OR EXISTS (
    SELECT 1 FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE c.teacher_id = _teacher_id AND cs.student_id = _student_id
  )
  OR EXISTS (
    SELECT 1 FROM public.lesson_records
    WHERE teacher_id = _teacher_id AND student_id = _student_id
  )
$$;
