
CREATE TABLE public.vocab_schedule_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  setting_id uuid NOT NULL,
  action_type text NOT NULL DEFAULT 'postpone',
  performed_by uuid,
  performed_by_name text,
  performed_at timestamptz NOT NULL DEFAULT now(),
  original_schedules jsonb NOT NULL DEFAULT '[]',
  new_schedules jsonb NOT NULL DEFAULT '[]',
  undone_at timestamptz,
  undone_by uuid,
  undone_by_name text,
  note text
);

ALTER TABLE public.vocab_schedule_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage vocab_schedule_logs"
  ON public.vocab_schedule_logs
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
