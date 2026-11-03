CREATE TABLE public.student_payment_day_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  old_day integer,
  new_day integer NOT NULL CHECK (new_day BETWEEN 1 AND 31),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_student_payment_day_changes_student ON public.student_payment_day_changes(student_id, created_at DESC);
GRANT SELECT, INSERT ON public.student_payment_day_changes TO authenticated;
GRANT ALL ON public.student_payment_day_changes TO service_role;
ALTER TABLE public.student_payment_day_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read payment day changes" ON public.student_payment_day_changes FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins add payment day changes" ON public.student_payment_day_changes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin') AND changed_by = auth.uid());