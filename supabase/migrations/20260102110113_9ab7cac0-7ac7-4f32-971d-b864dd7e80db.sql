
-- Allow assistants to view class_students (needed to load the modal data)
CREATE POLICY "Assistants can view class_students"
ON public.class_students
FOR SELECT
USING (has_role(auth.uid(), 'assistant'::app_role));
