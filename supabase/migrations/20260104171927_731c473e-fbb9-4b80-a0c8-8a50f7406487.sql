-- (1) Remove existing status check constraint and add new one with 'cancelled'
ALTER TABLE public.assistant_tasks DROP CONSTRAINT IF EXISTS assistant_tasks_status_check;
ALTER TABLE public.assistant_tasks ADD CONSTRAINT assistant_tasks_status_check 
  CHECK (status IN ('todo', 'doing', 'done', 'cancelled'));

-- (2) Update RLS policies for teacher cancel functionality
-- First, drop the existing teacher update policy if any
DROP POLICY IF EXISTS "Teachers can update own requests to cancel" ON public.assistant_tasks;

-- Create new policy: Teachers can only set status to 'cancelled' on their own non-done tasks
CREATE POLICY "Teachers can update own requests to cancel"
ON public.assistant_tasks
FOR UPDATE
USING (
  has_role(auth.uid(), 'teacher'::app_role) 
  AND created_by = auth.uid() 
  AND status IN ('todo', 'doing')
)
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role) 
  AND created_by = auth.uid() 
  AND status = 'cancelled'
);