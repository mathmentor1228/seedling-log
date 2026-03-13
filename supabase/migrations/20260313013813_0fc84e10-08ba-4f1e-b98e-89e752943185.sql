
-- Exam Prep Courses: groups multiple sessions together
CREATE TABLE public.exam_prep_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,
  teacher_id uuid NOT NULL,
  title text,
  description text,
  deadline_date date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Sessions within a course
CREATE TABLE public.exam_prep_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.exam_prep_courses(id) ON DELETE CASCADE,
  session_number int NOT NULL,
  session_label text NOT NULL,
  schedule_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Student enrollment in a course
CREATE TABLE public.exam_prep_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES public.exam_prep_courses(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  confirmed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(course_id, student_id)
);

-- Enable RLS
ALTER TABLE public.exam_prep_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prep_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prep_enrollments ENABLE ROW LEVEL SECURITY;

-- RLS policies for exam_prep_courses
CREATE POLICY "Admins can do all on exam_prep_courses" ON public.exam_prep_courses FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can manage own courses" ON public.exam_prep_courses FOR ALL TO public USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "Assistants can view exam_prep_courses" ON public.exam_prep_courses FOR SELECT TO public USING (has_role(auth.uid(), 'assistant'::app_role));

-- RLS policies for exam_prep_sessions
CREATE POLICY "Admins can do all on exam_prep_sessions" ON public.exam_prep_sessions FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can manage sessions of own courses" ON public.exam_prep_sessions FOR ALL TO public USING (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_sessions.course_id AND c.teacher_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_sessions.course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Assistants can view exam_prep_sessions" ON public.exam_prep_sessions FOR SELECT TO public USING (has_role(auth.uid(), 'assistant'::app_role));

-- RLS policies for exam_prep_enrollments
CREATE POLICY "Admins can do all on exam_prep_enrollments" ON public.exam_prep_enrollments FOR ALL TO public USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Teachers can manage enrollments of own courses" ON public.exam_prep_enrollments FOR ALL TO public USING (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_enrollments.course_id AND c.teacher_id = auth.uid())) WITH CHECK (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_enrollments.course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Assistants can view exam_prep_enrollments" ON public.exam_prep_enrollments FOR SELECT TO public USING (has_role(auth.uid(), 'assistant'::app_role));
