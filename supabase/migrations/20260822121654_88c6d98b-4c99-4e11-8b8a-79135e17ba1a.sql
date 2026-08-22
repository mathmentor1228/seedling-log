CREATE TABLE IF NOT EXISTS public.report_delivery_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  report_id uuid NOT NULL REFERENCES public.weekly_reports(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('confirmed','failed','revoked')),
  channel text NOT NULL CHECK (channel IN ('kakao','sms','call','other')),
  note text CHECK (note IS NULL OR char_length(note) <= 200),
  actor_id uuid NOT NULL DEFAULT auth.uid(),
  idempotency_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rde_report_created ON public.report_delivery_events(report_id, created_at DESC);

GRANT SELECT, INSERT ON public.report_delivery_events TO authenticated;
GRANT ALL ON public.report_delivery_events TO service_role;

ALTER TABLE public.report_delivery_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view delivery events"
ON public.report_delivery_events FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert delivery events"
ON public.report_delivery_events FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') AND actor_id = auth.uid());

CREATE POLICY "Teachers can view own student delivery events"
ON public.report_delivery_events FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher')
  AND EXISTS (
    SELECT 1 FROM public.weekly_reports w
    WHERE w.id = report_delivery_events.report_id
      AND public.teacher_owns_student(auth.uid(), w.student_id)
  )
);

CREATE POLICY "Teachers can insert own student delivery events"
ON public.report_delivery_events FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'teacher')
  AND actor_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.weekly_reports w
    WHERE w.id = report_delivery_events.report_id
      AND public.teacher_owns_student(auth.uid(), w.student_id)
  )
);