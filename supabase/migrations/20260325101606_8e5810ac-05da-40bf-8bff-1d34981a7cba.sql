
-- Add 'needs_reconfirm' status support and schedule_changed_at tracking
ALTER TABLE public.exam_prep_enrollments 
  ADD COLUMN IF NOT EXISTS schedule_changed_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS change_reason text DEFAULT NULL;

-- Create exam prep notifications table for targeted alerts
CREATE TABLE IF NOT EXISTS public.exam_prep_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid REFERENCES public.exam_prep_courses(id) ON DELETE CASCADE NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  notification_type text NOT NULL DEFAULT 'schedule_changed',
  message text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.exam_prep_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage exam prep notifications"
  ON public.exam_prep_notifications FOR ALL TO authenticated USING (true) WITH CHECK (true);
