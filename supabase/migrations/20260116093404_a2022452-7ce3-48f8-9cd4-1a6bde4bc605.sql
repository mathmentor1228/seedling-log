-- A) Add homework_check_note column to lesson_records
ALTER TABLE public.lesson_records 
ADD COLUMN IF NOT EXISTS homework_check_note TEXT NULL;

COMMENT ON COLUMN public.lesson_records.homework_check_note IS 'Assistant note for teacher alert when homework check requires special attention';

-- B) Create homework_alert_ack table for teacher acknowledgement
CREATE TABLE public.homework_alert_ack (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  source_lesson_id UUID NOT NULL REFERENCES public.lesson_records(id) ON DELETE CASCADE,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, source_lesson_id)
);

-- Enable RLS
ALTER TABLE public.homework_alert_ack ENABLE ROW LEVEL SECURITY;

-- RLS policies: teacher can insert/select own ack rows
CREATE POLICY "Teachers can insert their own acks"
ON public.homework_alert_ack
FOR INSERT
WITH CHECK (auth.uid() = teacher_id);

CREATE POLICY "Teachers can view their own acks"
ON public.homework_alert_ack
FOR SELECT
USING (auth.uid() = teacher_id);

-- Admin can read all
CREATE POLICY "Admin can read all acks"
ON public.homework_alert_ack
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);