
-- Drop existing restrictive policy and replace with one that includes is_admin_staff
DROP POLICY IF EXISTS "Admin and assistant can do all on student_onboarding_checks" ON public.student_onboarding_checks;

CREATE POLICY "Admin staff and assistants can do all on student_onboarding_checks"
  ON public.student_onboarding_checks
  FOR ALL
  USING (is_admin_staff() OR has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (is_admin_staff() OR has_role(auth.uid(), 'assistant'::app_role));
