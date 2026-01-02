-- Allow assistants to INSERT lesson_records for today's date only
-- This enables auto-creating draft records when none exist

CREATE POLICY "Assistants can insert lesson_records for today" 
ON public.lesson_records 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'assistant'::app_role) 
  AND lesson_date = CURRENT_DATE
);