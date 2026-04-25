ALTER TABLE public.routine_schedules
  ADD COLUMN IF NOT EXISTS auto_create_test boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS test_content text,
  ADD COLUMN IF NOT EXISTS last_generated_date date;

CREATE TABLE IF NOT EXISTS public.routine_generation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  routine_id uuid REFERENCES public.routine_schedules(id) ON DELETE SET NULL,
  generated_date date NOT NULL,
  student_ids jsonb DEFAULT '[]'::jsonb,
  test_record_ids jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_generation_logs_routine_id
  ON public.routine_generation_logs(routine_id);

CREATE INDEX IF NOT EXISTS idx_routine_generation_logs_generated_date
  ON public.routine_generation_logs(generated_date);

ALTER TABLE public.routine_generation_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view routine generation logs"
ON public.routine_generation_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'assistant')
  OR public.has_role(auth.uid(), 'teacher')
);

CREATE POLICY "Admins and assistants can create routine generation logs"
ON public.routine_generation_logs
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Admins and assistants can update routine generation logs"
ON public.routine_generation_logs
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Admins can delete routine generation logs"
ON public.routine_generation_logs
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));