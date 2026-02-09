
-- =============================================
-- 영어 단어테스트 관리 시스템 스키마
-- =============================================

-- 1. 학생별 단어테스트 설정 (교재, DAY수, 커트라인, 시험요일)
CREATE TABLE public.vocab_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  book_name text NOT NULL,
  days_per_test integer NOT NULL DEFAULT 1,
  cutline_percent integer NOT NULL DEFAULT 80,
  test_days text[] NOT NULL DEFAULT '{mon_wed}'::text[],
  current_day_number integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id)
);

ALTER TABLE public.vocab_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do all on vocab_settings"
  ON public.vocab_settings FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can manage vocab_settings"
  ON public.vocab_settings FOR ALL
  USING (has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Assistants can view and update vocab_settings"
  ON public.vocab_settings FOR SELECT
  USING (has_role(auth.uid(), 'assistant'::app_role));

CREATE POLICY "Assistants can update vocab_settings"
  ON public.vocab_settings FOR UPDATE
  USING (has_role(auth.uid(), 'assistant'::app_role));

-- 2. 단어테스트 스케줄 (월별 자동/수동 생성)
CREATE TABLE public.vocab_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  setting_id uuid NOT NULL REFERENCES public.vocab_settings(id) ON DELETE CASCADE,
  test_date date NOT NULL,
  day_number integer NOT NULL,
  book_name text NOT NULL,
  schedule_type text NOT NULL DEFAULT 'regular',
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vocab_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do all on vocab_schedules"
  ON public.vocab_schedules FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can manage vocab_schedules"
  ON public.vocab_schedules FOR ALL
  USING (has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Assistants can manage vocab_schedules"
  ON public.vocab_schedules FOR ALL
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

-- 3. 단어테스트 결과
CREATE TABLE public.vocab_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.vocab_schedules(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  test_date date NOT NULL,
  day_number integer NOT NULL,
  book_name text NOT NULL,
  total_words integer,
  correct_words integer,
  score_percent integer,
  passed boolean NOT NULL DEFAULT false,
  recorded_by uuid,
  retest_scheduled boolean NOT NULL DEFAULT false,
  retest_date date,
  retest_requested_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vocab_test_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do all on vocab_test_results"
  ON public.vocab_test_results FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Teachers can manage vocab_test_results"
  ON public.vocab_test_results FOR ALL
  USING (has_role(auth.uid(), 'teacher'::app_role))
  WITH CHECK (has_role(auth.uid(), 'teacher'::app_role));

CREATE POLICY "Assistants can manage vocab_test_results"
  ON public.vocab_test_results FOR ALL
  USING (has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (has_role(auth.uid(), 'assistant'::app_role));

-- updated_at 트리거
CREATE TRIGGER update_vocab_settings_updated_at
  BEFORE UPDATE ON public.vocab_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vocab_test_results_updated_at
  BEFORE UPDATE ON public.vocab_test_results
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 인덱스
CREATE INDEX idx_vocab_settings_student ON public.vocab_settings(student_id);
CREATE INDEX idx_vocab_schedules_student_date ON public.vocab_schedules(student_id, test_date);
CREATE INDEX idx_vocab_test_results_student_date ON public.vocab_test_results(student_id, test_date);
CREATE INDEX idx_vocab_test_results_schedule ON public.vocab_test_results(schedule_id);
