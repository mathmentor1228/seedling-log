CREATE TABLE public.student_course_teacher_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_course_id uuid REFERENCES public.student_courses(id) ON DELETE SET NULL,
  subject text,
  from_teacher_id uuid REFERENCES public.profiles(id),
  to_teacher_id uuid REFERENCES public.profiles(id),
  from_teacher_name text,
  to_teacher_name text,
  effective_date date NOT NULL,
  reason text,
  changed_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_course_teacher_changes TO authenticated;
GRANT ALL ON public.student_course_teacher_changes TO service_role;

ALTER TABLE public.student_course_teacher_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view teacher changes"
ON public.student_course_teacher_changes FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'teacher'::app_role) OR has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Admins can insert teacher changes"
ON public.student_course_teacher_changes FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update teacher changes"
ON public.student_course_teacher_changes FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete teacher changes"
ON public.student_course_teacher_changes FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE INDEX idx_sctc_student ON public.student_course_teacher_changes(student_id);
CREATE INDEX idx_sctc_course ON public.student_course_teacher_changes(student_course_id);
CREATE INDEX idx_sctc_effective ON public.student_course_teacher_changes(effective_date);

CREATE TRIGGER update_sctc_updated_at BEFORE UPDATE ON public.student_course_teacher_changes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();