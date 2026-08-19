CREATE TABLE public.parent_survey_sends (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_by UUID,
  status TEXT NOT NULL DEFAULT 'sent',
  provider_message_id TEXT,
  error_message TEXT
);

GRANT SELECT ON public.parent_survey_sends TO authenticated;
GRANT ALL ON public.parent_survey_sends TO service_role;

ALTER TABLE public.parent_survey_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view parent survey sends"
ON public.parent_survey_sends FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_parent_survey_sends_student ON public.parent_survey_sends(student_id, sent_at DESC);