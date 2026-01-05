-- REQUEST-CREATE-FIX-V1
-- Fix CHECK constraints to include missing values

-- Drop and recreate assignee constraint to include '미배정'
ALTER TABLE public.assistant_tasks DROP CONSTRAINT IF EXISTS assistant_tasks_assignee_check;
ALTER TABLE public.assistant_tasks ADD CONSTRAINT assistant_tasks_assignee_check 
  CHECK (assignee = ANY (ARRAY['유빈조교', '다인조교', '미배정']));

-- Drop and recreate task_type constraint to include 'teacher_request'
ALTER TABLE public.assistant_tasks DROP CONSTRAINT IF EXISTS assistant_tasks_task_type_check;
ALTER TABLE public.assistant_tasks ADD CONSTRAINT assistant_tasks_task_type_check 
  CHECK (task_type = ANY (ARRAY['homework_verify', 'test_entry', 'attendance_check', 'teacher_remind', 'makeup_check', 'etc', 'teacher_request']));