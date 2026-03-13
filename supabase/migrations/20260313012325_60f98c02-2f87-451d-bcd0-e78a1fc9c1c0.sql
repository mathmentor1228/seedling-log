
-- Exam prep schedules table
CREATE TABLE public.exam_prep_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  teacher_id UUID NOT NULL,
  schedule_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  description TEXT,
  deadline_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'auto_confirmed')),
  confirmed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.exam_prep_schedules ENABLE ROW LEVEL SECURITY;

-- Admin/teacher can do everything
CREATE POLICY "admin_teacher_full_access" ON public.exam_prep_schedules
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- Index for student lookups
CREATE INDEX idx_exam_prep_student ON public.exam_prep_schedules(student_id);
CREATE INDEX idx_exam_prep_status ON public.exam_prep_schedules(status);
CREATE INDEX idx_exam_prep_deadline ON public.exam_prep_schedules(deadline_date);
