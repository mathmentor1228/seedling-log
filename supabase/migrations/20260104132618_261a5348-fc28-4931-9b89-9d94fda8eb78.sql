-- Add created_by and created_by_role columns to assistant_tasks
ALTER TABLE public.assistant_tasks 
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS created_by_role TEXT;

-- Update existing rows to have created_by from the first admin (for backward compatibility)
-- This is optional as existing rows don't have creator info

-- Add index for faster queries by creator
CREATE INDEX IF NOT EXISTS idx_assistant_tasks_created_by ON public.assistant_tasks(created_by);

-- Add RLS policy for teachers to view/create their own requests
DROP POLICY IF EXISTS "Teachers can view own created tasks" ON public.assistant_tasks;
CREATE POLICY "Teachers can view own created tasks"
ON public.assistant_tasks
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role) 
  AND created_by = auth.uid()
);

DROP POLICY IF EXISTS "Teachers can insert own tasks" ON public.assistant_tasks;
CREATE POLICY "Teachers can insert own tasks"
ON public.assistant_tasks
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role) 
  AND created_by = auth.uid()
);