
-- Allow teachers to delete homework for their own students
CREATE POLICY "Teachers can delete homework for their students"
ON public.homework_assignments
FOR DELETE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND teacher_owns_student(auth.uid(), student_id)
);

-- Allow assistants to delete homework within 7 days
CREATE POLICY "Assistants can delete homework within 7 days"
ON public.homework_assignments
FOR DELETE
USING (
  has_role(auth.uid(), 'assistant'::app_role)
  AND assigned_date >= (CURRENT_DATE - '7 days'::interval)
);
