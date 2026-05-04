-- Allow teachers to create and delete their own classes so the
-- "내 수업 일정 만들기" flow can persist class rows. Without this,
-- class_schedules + class_students inserts cascade-fail because the
-- parent classes row cannot be created under RLS.

CREATE POLICY "Teachers can insert their own classes"
ON public.classes
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND teacher_id = auth.uid()
);

CREATE POLICY "Teachers can delete their own classes"
ON public.classes
FOR DELETE
TO authenticated
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND teacher_id = auth.uid()
);