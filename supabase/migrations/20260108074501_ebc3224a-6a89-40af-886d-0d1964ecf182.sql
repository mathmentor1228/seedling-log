-- Create test_visits table for standalone test-only visits
CREATE TABLE public.test_visits (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject TEXT NOT NULL CHECK (subject IN ('수학', '과학', '영어', '국어')),
  visit_date DATE NOT NULL DEFAULT CURRENT_DATE,
  visit_time TIME WITHOUT TIME ZONE NOT NULL,
  test_result_text TEXT,
  english_pass_fail TEXT CHECK (english_pass_fail IS NULL OR english_pass_fail IN ('pass', 'fail')),
  test_assistant TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.test_visits ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can do all on test_visits"
  ON public.test_visits
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Assistant full access
CREATE POLICY "Assistants can do all on test_visits"
  ON public.test_visits
  FOR ALL
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

-- Teacher read-only
CREATE POLICY "Teachers can view test_visits"
  ON public.test_visits
  FOR SELECT
  USING (has_role(auth.uid(), 'teacher'::app_role));

-- Add index for common queries
CREATE INDEX idx_test_visits_date ON public.test_visits(visit_date);
CREATE INDEX idx_test_visits_student_subject_date ON public.test_visits(student_id, subject, visit_date);