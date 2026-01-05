-- REQUEST-CREATE-STABLE-V2

-- Safer defaults so inserts don't fail even if the app misses a field.
ALTER TABLE public.assistant_tasks
  ALTER COLUMN assignee SET DEFAULT '미배정',
  ALTER COLUMN task_date SET DEFAULT CURRENT_DATE,
  ALTER COLUMN status SET DEFAULT 'todo',
  ALTER COLUMN priority SET DEFAULT 'normal';

-- Align teacher INSERT policy with the expected payload fields.
DROP POLICY IF EXISTS "Teachers can insert own tasks" ON public.assistant_tasks;
CREATE POLICY "Teachers can insert own tasks"
ON public.assistant_tasks
FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND created_by = auth.uid()
  AND created_by_role = ANY (ARRAY['teacher'::text, 'admin'::text, 'assistant'::text])
  AND status = ANY (ARRAY['todo'::text, 'doing'::text, 'done'::text, 'cancelled'::text])
);
