
CREATE TABLE public.student_onboarding_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  check_key text NOT NULL,
  checked boolean NOT NULL DEFAULT false,
  checked_at timestamptz,
  checked_by uuid,
  checked_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, check_key)
);

ALTER TABLE public.student_onboarding_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin and assistant can do all on student_onboarding_checks"
ON public.student_onboarding_checks
FOR ALL
TO public
USING (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'assistant'))
WITH CHECK (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'assistant'));

CREATE POLICY "Teachers can view student_onboarding_checks"
ON public.student_onboarding_checks
FOR SELECT
TO public
USING (has_role(auth.uid(), 'teacher'));
