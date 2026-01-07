-- ASSISTANT-REQUEST-UNIQUE-INDEX-REMOVED-V2
-- Drop the unique index that blocks multiple assistant requests per teacher/day/type

DROP INDEX IF EXISTS public.idx_assistant_tasks_unique_template;

-- Also drop any constraint with similar name if exists
ALTER TABLE public.assistant_tasks DROP CONSTRAINT IF EXISTS assistant_tasks_unique_template;