CREATE TABLE IF NOT EXISTS public.daily_report_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  variables jsonb,
  UNIQUE (student_id, report_date)
);

GRANT SELECT ON public.daily_report_sends TO authenticated;
GRANT ALL ON public.daily_report_sends TO service_role;

ALTER TABLE public.daily_report_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_report_sends_admin_read" ON public.daily_report_sends
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );