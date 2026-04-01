
CREATE TABLE public.vocab_test_assignments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  word_set_ids UUID[] NOT NULL DEFAULT '{}',
  test_mode TEXT NOT NULL DEFAULT 'web' CHECK (test_mode IN ('web', 'print')),
  test_level INTEGER NOT NULL DEFAULT 1 CHECK (test_level BETWEEN 1 AND 3),
  test_time_limit INTEGER NULL,
  test_direction TEXT NOT NULL DEFAULT 'eng_to_kor' CHECK (test_direction IN ('eng_to_kor', 'kor_to_eng', 'mixed')),
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'in_progress', 'completed', 'expired')),
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  due_date DATE NULL,
  score INTEGER NULL,
  total_questions INTEGER NULL,
  correct_count INTEGER NULL,
  completed_at TIMESTAMP WITH TIME ZONE NULL,
  result_entered_by UUID REFERENCES auth.users(id) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.vocab_test_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view vocab test assignments"
  ON public.vocab_test_assignments FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Teachers and admins can manage vocab test assignments"
  ON public.vocab_test_assignments FOR ALL
  TO authenticated USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );
