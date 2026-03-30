
-- 수학질문방 테이블

-- 1. math_questions
CREATE TABLE public.math_questions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  photo_problem_url TEXT NOT NULL,
  photo_solution_url TEXT NOT NULL,
  grade TEXT NOT NULL CHECK (grade IN ('고1','고2','고3','중3')),
  subject TEXT NOT NULL CHECK (subject IN ('수학I','수학II','미적분','확통','기하')),
  source_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT '대기중' CHECK (status IN ('대기중','답변완료','힌트제공','공유됨')),
  is_shared BOOLEAN NOT NULL DEFAULT false,
  shared_from_id UUID REFERENCES public.math_questions(id),
  view_count INT NOT NULL DEFAULT 0,
  teacher_id UUID,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. math_answers
CREATE TABLE public.math_answers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  question_id UUID NOT NULL REFERENCES public.math_questions(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL,
  answer_type TEXT NOT NULL CHECK (answer_type IN ('힌트','전체해설','사진풀이','영상링크')),
  content TEXT,
  answer_photo_urls TEXT[] NOT NULL DEFAULT '{}',
  video_url TEXT,
  answer_input_mode TEXT NOT NULL DEFAULT 'text' CHECK (answer_input_mode IN ('text','photo','both','video')),
  is_shared_to_all BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.math_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.math_answers ENABLE ROW LEVEL SECURITY;

-- RLS: math_questions
CREATE POLICY "Staff can view all questions" ON public.math_questions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Shared questions are viewable" ON public.math_questions
  FOR SELECT TO authenticated
  USING (is_shared = true);

CREATE POLICY "Staff can insert questions" ON public.math_questions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Staff can update questions" ON public.math_questions
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Staff can delete questions" ON public.math_questions
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher')
  );

-- RLS: math_answers
CREATE POLICY "Staff can view all answers" ON public.math_answers
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Shared answers viewable" ON public.math_answers
  FOR SELECT TO authenticated
  USING (is_shared_to_all = true);

CREATE POLICY "Teachers can insert answers" ON public.math_answers
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
    AND teacher_id = auth.uid()
  );

CREATE POLICY "Teachers can update own answers" ON public.math_answers
  FOR UPDATE TO authenticated
  USING (
    (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher'))
    AND teacher_id = auth.uid()
  );

CREATE POLICY "Admin can delete answers" ON public.math_answers
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Daily limit function
CREATE OR REPLACE FUNCTION public.check_math_question_daily_limit(_student_id UUID, _date DATE DEFAULT CURRENT_DATE)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    SELECT COUNT(*) FROM public.math_questions
    WHERE student_id = _student_id AND date = _date
  ) < 10;
$$;

-- Indexes
CREATE INDEX idx_math_questions_student_date ON public.math_questions(student_id, date);
CREATE INDEX idx_math_questions_status ON public.math_questions(status);
CREATE INDEX idx_math_questions_shared ON public.math_questions(is_shared) WHERE is_shared = true;
CREATE INDEX idx_math_answers_question ON public.math_answers(question_id);
