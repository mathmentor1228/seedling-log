CREATE TABLE public.weekly_report_gdocs (
  week_start date PRIMARY KEY,
  document_id text NOT NULL,
  document_url text NOT NULL,
  last_uploaded_at timestamptz NOT NULL DEFAULT now(),
  last_student_count integer NOT NULL DEFAULT 0
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.weekly_report_gdocs TO authenticated;
GRANT ALL ON public.weekly_report_gdocs TO service_role;
ALTER TABLE public.weekly_report_gdocs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage gdoc links" ON public.weekly_report_gdocs
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));