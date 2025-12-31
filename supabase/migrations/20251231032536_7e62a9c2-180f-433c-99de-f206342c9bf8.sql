-- Allow assistants to view class schedules
CREATE POLICY "Assistants can view class_schedules"
ON public.class_schedules
FOR SELECT
USING (has_role(auth.uid(), 'assistant'::app_role));