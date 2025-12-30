-- Drop existing teacher policies on homework_assignments
DROP POLICY IF EXISTS "Teachers can view homework_assignments" ON public.homework_assignments;
DROP POLICY IF EXISTS "Teachers can insert homework_assignments" ON public.homework_assignments;
DROP POLICY IF EXISTS "Teachers can update homework_assignments" ON public.homework_assignments;

-- Create helper function to check if teacher owns student (has lesson records with them)
CREATE OR REPLACE FUNCTION public.teacher_owns_student(_teacher_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.lesson_records
    WHERE teacher_id = _teacher_id
      AND student_id = _student_id
  )
$$;

-- Teachers can SELECT homework for students they have lesson records with
CREATE POLICY "Teachers can view their students homework"
ON public.homework_assignments
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role) 
  AND public.teacher_owns_student(auth.uid(), student_id)
);

-- Teachers can INSERT homework when linked to their own lesson record
CREATE POLICY "Teachers can insert homework for their lessons"
ON public.homework_assignments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND (
    lesson_record_id IS NULL 
    OR EXISTS (
      SELECT 1 FROM public.lesson_records 
      WHERE id = lesson_record_id 
      AND teacher_id = auth.uid()
    )
  )
  AND public.teacher_owns_student(auth.uid(), student_id)
);

-- Teachers can UPDATE check_status/result/notes on homework for their students
CREATE POLICY "Teachers can update homework check for their students"
ON public.homework_assignments
FOR UPDATE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND public.teacher_owns_student(auth.uid(), student_id)
);