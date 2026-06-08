CREATE TABLE public.historical_monthly_tuition (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  year_month TEXT NOT NULL,
  student_name TEXT NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  billed NUMERIC(12,0) NOT NULL DEFAULT 0,
  paid NUMERIC(12,0) NOT NULL DEFAULT 0,
  payment_method TEXT,
  memo TEXT,
  paid_at DATE,
  billed_at DATE,
  source TEXT DEFAULT 'csv_import',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_hist_tuition_ym ON public.historical_monthly_tuition (year_month);
CREATE INDEX idx_hist_tuition_student ON public.historical_monthly_tuition (student_id);
CREATE INDEX idx_hist_tuition_name ON public.historical_monthly_tuition (student_name);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.historical_monthly_tuition TO authenticated;
GRANT ALL ON public.historical_monthly_tuition TO service_role;

ALTER TABLE public.historical_monthly_tuition ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage historical tuition"
ON public.historical_monthly_tuition
FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_historical_monthly_tuition_updated_at
BEFORE UPDATE ON public.historical_monthly_tuition
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();