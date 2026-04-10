-- Create teacher notifications table
CREATE TABLE public.teacher_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  notification_type text NOT NULL DEFAULT 'general',
  title text NOT NULL,
  message text,
  is_read boolean NOT NULL DEFAULT false,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.teacher_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can view own notifications"
  ON public.teacher_notifications FOR SELECT
  TO authenticated
  USING (teacher_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can update own notifications"
  ON public.teacher_notifications FOR UPDATE
  TO authenticated
  USING (teacher_id = auth.uid())
  WITH CHECK (teacher_id = auth.uid());

-- Service role inserts (from edge function), so no INSERT policy needed for authenticated

CREATE INDEX idx_teacher_notifications_teacher ON public.teacher_notifications(teacher_id, is_read, created_at DESC);

-- Enable realtime for teacher notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.teacher_notifications;