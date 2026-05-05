
CREATE TABLE IF NOT EXISTS public.teacher_monthly_compensation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month text NOT NULL, -- YYYY-MM
  salary numeric(12,0) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, month)
);

ALTER TABLE public.teacher_monthly_compensation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage teacher comp" ON public.teacher_monthly_compensation
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_teacher_monthly_compensation_updated_at
  BEFORE UPDATE ON public.teacher_monthly_compensation
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_teacher_comp_month ON public.teacher_monthly_compensation(month);
CREATE INDEX idx_teacher_comp_teacher ON public.teacher_monthly_compensation(teacher_id);
