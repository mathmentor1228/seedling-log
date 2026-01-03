-- A1) Add due_date and priority to assistant_tasks
ALTER TABLE public.assistant_tasks
ADD COLUMN IF NOT EXISTS due_date DATE NULL,
ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal';

-- Add check constraint for priority (if not exists - use DO block)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'assistant_tasks_priority_check'
  ) THEN
    ALTER TABLE public.assistant_tasks
    ADD CONSTRAINT assistant_tasks_priority_check
    CHECK (priority IN ('low', 'normal', 'high'));
  END IF;
END $$;

-- A2) Create task_attachments table
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES public.assistant_tasks(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS task_attachments_task_id_idx ON public.task_attachments(task_id);

-- Enable RLS on task_attachments
ALTER TABLE public.task_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for task_attachments
CREATE POLICY "Admins can do all on task_attachments"
ON public.task_attachments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Assistants can do all on task_attachments"
ON public.task_attachments
FOR ALL
USING (has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Teachers can view own task attachments"
ON public.task_attachments
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.assistant_tasks t
    WHERE t.id = task_id
    AND t.related_teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can insert own task attachments"
ON public.task_attachments
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'teacher'::app_role)
  AND uploaded_by = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.assistant_tasks t
    WHERE t.id = task_id
    AND t.related_teacher_id = auth.uid()
  )
);

-- B1) Create event_attachments table for calendar posters
CREATE TABLE IF NOT EXISTS public.event_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.academy_events(id) ON DELETE CASCADE NOT NULL,
  storage_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS event_attachments_event_id_idx ON public.event_attachments(event_id);

-- Enable RLS on event_attachments
ALTER TABLE public.event_attachments ENABLE ROW LEVEL SECURITY;

-- RLS policies for event_attachments
-- Admin can do all
CREATE POLICY "Admins can do all on event_attachments"
ON public.event_attachments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Assistant can do all
CREATE POLICY "Assistants can do all on event_attachments"
ON public.event_attachments
FOR ALL
USING (has_role(auth.uid(), 'assistant'::app_role))
WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

-- Teachers can only view
CREATE POLICY "Teachers can view event_attachments"
ON public.event_attachments
FOR SELECT
USING (has_role(auth.uid(), 'teacher'::app_role));

-- B2) Create storage bucket for attachments
INSERT INTO storage.buckets (id, name, public)
VALUES ('attachments', 'attachments', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS policies for attachments bucket
-- Admin can do all
CREATE POLICY "Admin full access to attachments"
ON storage.objects
FOR ALL
USING (bucket_id = 'attachments' AND has_role(auth.uid(), 'admin'::app_role));

-- Assistant can do all
CREATE POLICY "Assistant full access to attachments"
ON storage.objects
FOR ALL
USING (bucket_id = 'attachments' AND has_role(auth.uid(), 'assistant'::app_role));

-- Teachers can read task files for their own tasks
CREATE POLICY "Teachers can read own task attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'attachments'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (
    -- Allow reading tasks/{task_id}/... if task belongs to teacher
    (storage.foldername(name))[1] = 'tasks'
    AND EXISTS (
      SELECT 1 FROM public.assistant_tasks t
      WHERE t.id::text = (storage.foldername(name))[2]
      AND t.related_teacher_id = auth.uid()
    )
  )
);

-- Teachers can write to their own tasks
CREATE POLICY "Teachers can upload own task attachments"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'attachments'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = 'tasks'
  AND EXISTS (
    SELECT 1 FROM public.assistant_tasks t
    WHERE t.id::text = (storage.foldername(name))[2]
    AND t.related_teacher_id = auth.uid()
  )
);

-- Teachers can read event attachments (posters)
CREATE POLICY "Teachers can read event attachments"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'attachments'
  AND has_role(auth.uid(), 'teacher'::app_role)
  AND (storage.foldername(name))[1] = 'events'
);