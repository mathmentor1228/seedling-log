CREATE TABLE public.parent_learning_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL UNIQUE REFERENCES public.students(id) ON DELETE CASCADE,
  delivery_preference text,
  daily_topics text[] NOT NULL DEFAULT '{}',
  weekly_detail_preference text,
  portal_feedback text,
  learning_interests text[] NOT NULL DEFAULT '{}',
  satisfaction_areas text[] NOT NULL DEFAULT '{}',
  improvement_feedback text,
  parent_message text,
  survey_notice_confirmed boolean NOT NULL DEFAULT false,
  learning_management_consent boolean NOT NULL DEFAULT false,
  notification_preference text,
  public_web_consent boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL DEFAULT 'v1',
  guardian_name text,
  guardian_relationship text,
  legal_representative_confirmed boolean NOT NULL DEFAULT false,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parent_learning_feedback TO authenticated;
GRANT ALL ON public.parent_learning_feedback TO service_role;

ALTER TABLE public.parent_learning_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage parent learning feedback"
ON public.parent_learning_feedback FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_parent_learning_feedback_updated_at
BEFORE UPDATE ON public.parent_learning_feedback
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();