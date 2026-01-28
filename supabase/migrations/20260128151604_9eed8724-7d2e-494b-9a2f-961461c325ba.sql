-- REQUEST-REPLIES-V1: Create replies table for assistant task threads
CREATE TABLE public.task_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.assistant_tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.task_replies ENABLE ROW LEVEL SECURITY;

-- Create index for faster lookups
CREATE INDEX idx_task_replies_task_id ON public.task_replies(task_id);
CREATE INDEX idx_task_replies_created_at ON public.task_replies(created_at);

-- RLS Policies
-- Admin: full CRUD
CREATE POLICY "Admins can do all on task_replies"
  ON public.task_replies
  FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Assistants: full CRUD (they manage tasks)
CREATE POLICY "Assistants can do all on task_replies"
  ON public.task_replies
  FOR ALL
  USING (has_role(auth.uid(), 'assistant'))
  WITH CHECK (has_role(auth.uid(), 'assistant'));

-- Teachers: SELECT and INSERT for tasks they created or are related to
CREATE POLICY "Teachers can view replies on their tasks"
  ON public.task_replies
  FOR SELECT
  USING (
    has_role(auth.uid(), 'teacher') AND
    EXISTS (
      SELECT 1 FROM assistant_tasks t
      WHERE t.id = task_replies.task_id
      AND (t.created_by = auth.uid() OR t.related_teacher_id = auth.uid())
    )
  );

CREATE POLICY "Teachers can insert replies on their tasks"
  ON public.task_replies
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'teacher') AND
    author_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM assistant_tasks t
      WHERE t.id = task_replies.task_id
      AND (t.created_by = auth.uid() OR t.related_teacher_id = auth.uid())
    )
  );