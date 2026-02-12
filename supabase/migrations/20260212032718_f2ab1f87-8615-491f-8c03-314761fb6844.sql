
-- Allow teachers to add students to their own classes
CREATE POLICY "Teachers can insert students to own classes"
ON public.class_students
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_students.class_id
      AND classes.teacher_id = auth.uid()
  )
);

-- Allow teachers to remove students from their own classes
CREATE POLICY "Teachers can delete students from own classes"
ON public.class_students
FOR DELETE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.classes
    WHERE classes.id = class_students.class_id
      AND classes.teacher_id = auth.uid()
  )
);
