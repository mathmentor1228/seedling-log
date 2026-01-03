-- Create assistant_tasks table for checklist management
CREATE TABLE public.assistant_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_date DATE NOT NULL,
  task_type TEXT NOT NULL CHECK (task_type IN ('homework_verify', 'test_entry', 'attendance_check', 'teacher_remind', 'makeup_check', 'etc')),
  title TEXT NOT NULL,
  assignee TEXT NOT NULL CHECK (assignee IN ('유빈조교', '다인조교')),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  notes TEXT,
  related_student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  related_teacher_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Unique constraint for template tasks to prevent duplicates
CREATE UNIQUE INDEX idx_assistant_tasks_unique_template 
ON public.assistant_tasks(task_date, task_type, COALESCE(related_student_id, '00000000-0000-0000-0000-000000000000'), COALESCE(related_teacher_id, '00000000-0000-0000-0000-000000000000'));

-- Enable RLS
ALTER TABLE public.assistant_tasks ENABLE ROW LEVEL SECURITY;

-- RLS: Admin full access
CREATE POLICY "Admins can do all on assistant_tasks"
ON public.assistant_tasks
FOR ALL
USING (has_role(auth.uid(), 'admin'));

-- RLS: Assistant full CRUD
CREATE POLICY "Assistants can do all on assistant_tasks"
ON public.assistant_tasks
FOR ALL
USING (has_role(auth.uid(), 'assistant'))
WITH CHECK (has_role(auth.uid(), 'assistant'));

-- No teacher access (no policies for teachers)

-- Add updated_at trigger (reuse existing function)
CREATE TRIGGER update_assistant_tasks_updated_at
BEFORE UPDATE ON public.assistant_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();