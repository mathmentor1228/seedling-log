-- ASSISTANT-TASKTYPE-FREE-V1
-- Remove the CHECK constraint on task_type to allow any value

ALTER TABLE public.assistant_tasks
  DROP CONSTRAINT IF EXISTS assistant_tasks_task_type_check;

-- Ensure column has a sensible default if NULL/empty is passed
ALTER TABLE public.assistant_tasks
  ALTER COLUMN task_type SET DEFAULT '기타';