
-- General test schedules (not limited to vocab)
CREATE TABLE public.test_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  test_date DATE NOT NULL,
  test_time TIME WITHOUT TIME ZONE,
  subject TEXT NOT NULL,
  test_type TEXT NOT NULL DEFAULT 'guerrilla',
  content TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.test_schedules ENABLE ROW LEVEL SECURITY;

-- Admins can do all
CREATE POLICY "Admins can do all on test_schedules"
  ON public.test_schedules FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Assistants can do all
CREATE POLICY "Assistants can do all on test_schedules"
  ON public.test_schedules FOR ALL
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

-- Teachers can manage their own test schedules
CREATE POLICY "Teachers can manage own test_schedules"
  ON public.test_schedules FOR ALL
  USING (has_role(auth.uid(), 'teacher'::app_role) AND teacher_id = auth.uid())
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role) AND teacher_id = auth.uid());

-- Index for student lookups
CREATE INDEX idx_test_schedules_student_date ON public.test_schedules(student_id, test_date);
CREATE INDEX idx_test_schedules_teacher ON public.test_schedules(teacher_id);
