
-- Table to store one-off schedule overrides (moved or cancelled for a specific date)
CREATE TABLE public.schedule_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  original_date date NOT NULL,
  override_type text NOT NULL DEFAULT 'moved', -- 'cancelled' or 'moved'
  new_date date, -- null if cancelled
  new_start_time time without time zone, -- null if cancelled
  new_end_time time without time zone, -- null if cancelled
  reason text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(schedule_id, original_date)
);

ALTER TABLE public.schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Teachers can manage own schedule_overrides" ON public.schedule_overrides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'teacher'::app_role) AND teacher_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND teacher_id = auth.uid());

CREATE POLICY "Admins can do all on schedule_overrides" ON public.schedule_overrides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Assistants can do all on schedule_overrides" ON public.schedule_overrides
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));
