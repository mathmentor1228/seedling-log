CREATE TABLE public.student_courses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  course_policy_id UUID NOT NULL REFERENCES public.course_policies(id) ON DELETE RESTRICT,
  teacher_id UUID REFERENCES public.profiles(id),
  start_date DATE NOT NULL,
  end_date DATE,
  status TEXT NOT NULL DEFAULT '활성' CHECK (status IN ('활성', '중단', '종료')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, course_policy_id)
);

ALTER TABLE public.student_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view student_courses"
  ON public.student_courses FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert student_courses"
  ON public.student_courses FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update student_courses"
  ON public.student_courses FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete student_courses"
  ON public.student_courses FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_student_courses_updated_at
  BEFORE UPDATE ON public.student_courses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_student_courses_student ON public.student_courses(student_id);
CREATE INDEX idx_student_courses_teacher ON public.student_courses(teacher_id);
CREATE INDEX idx_student_courses_status ON public.student_courses(status);