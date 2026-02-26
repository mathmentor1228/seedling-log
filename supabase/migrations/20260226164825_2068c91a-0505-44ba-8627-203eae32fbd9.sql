
-- Test routine settings table
CREATE TABLE public.test_routines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  teacher_id UUID NOT NULL,
  subject TEXT NOT NULL,
  day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  test_time TIME,
  test_type TEXT NOT NULL DEFAULT 'guerrilla',
  content_template TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Students assigned to each routine
CREATE TABLE public.test_routine_students (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  routine_id UUID NOT NULL REFERENCES public.test_routines(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(routine_id, student_id)
);

-- RLS for test_routines
ALTER TABLE public.test_routines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do all on test_routines"
  ON public.test_routines FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Assistants can do all on test_routines"
  ON public.test_routines FOR ALL
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Teachers can manage own test_routines"
  ON public.test_routines FOR ALL
  USING (has_role(auth.uid(), 'teacher'::app_role) AND teacher_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND teacher_id = auth.uid());

-- RLS for test_routine_students
ALTER TABLE public.test_routine_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do all on test_routine_students"
  ON public.test_routine_students FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Assistants can do all on test_routine_students"
  ON public.test_routine_students FOR ALL
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Teachers can manage own routine students"
  ON public.test_routine_students FOR ALL
  USING (has_role(auth.uid(), 'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.test_routines r WHERE r.id = routine_id AND r.teacher_id = auth.uid()
  ))
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.test_routines r WHERE r.id = routine_id AND r.teacher_id = auth.uid()
  ));
