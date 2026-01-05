-- Add policy: Teachers can view submitted lesson_records for students they teach
CREATE POLICY "Teachers can view submitted records for their students"
ON public.lesson_records
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND submitted = true
  AND EXISTS (
    SELECT 1
    FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = lesson_records.student_id
      AND c.teacher_id = auth.uid()
  )
);