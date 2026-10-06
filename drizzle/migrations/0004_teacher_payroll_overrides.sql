CREATE TABLE public.teacher_payroll_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_course_id uuid NOT NULL REFERENCES public.student_courses(id) ON DELETE CASCADE,
  billing_month text NOT NULL,
  override_amount integer,
  memo text,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_course_id, billing_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.teacher_payroll_overrides TO authenticated;
GRANT ALL ON public.teacher_payroll_overrides TO service_role;
ALTER TABLE public.teacher_payroll_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage payroll overrides" ON public.teacher_payroll_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE TRIGGER trg_payroll_overrides_updated BEFORE UPDATE ON public.teacher_payroll_overrides
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();