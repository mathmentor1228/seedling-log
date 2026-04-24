-- 학생 자가진단 테이블
CREATE TABLE IF NOT EXISTS public.exam_student_self_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  review_id uuid NOT NULL REFERENCES public.exam_reviews(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id),
  item_number int NOT NULL,
  self_error_types jsonb DEFAULT '[]'::jsonb,
  self_custom_reason text,
  q_remembered boolean,
  q_concept_confused boolean,
  q_academy_helped boolean,
  q_need_more text,
  q_my_mistake text,
  submitted_at timestamptz DEFAULT now(),
  UNIQUE (review_id, item_number)
);

-- exam_reviews에 자가진단 완료 컬럼 추가
ALTER TABLE public.exam_reviews
  ADD COLUMN IF NOT EXISTS self_check_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS self_check_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS self_check_points_given boolean DEFAULT false;

-- 학교별 시험 총평
CREATE TABLE IF NOT EXISTS public.school_exam_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  grade text NOT NULL,
  subject text NOT NULL,
  exam_type text NOT NULL,
  exam_year int NOT NULL,
  exam_period text NOT NULL,
  total_students int DEFAULT 0,
  avg_score float,
  wrong_item_stats jsonb DEFAULT '[]'::jsonb,
  academy_helped_rate float,
  top_weak_concepts jsonb DEFAULT '[]'::jsonb,
  recommended_study jsonb DEFAULT '[]'::jsonb,
  ai_report text,
  final_report text,
  published boolean DEFAULT false,
  published_at timestamptz,
  created_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE(school_name, grade, subject, exam_type, exam_year, exam_period)
);

-- RLS
ALTER TABLE public.exam_student_self_checks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all" ON public.exam_student_self_checks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE public.school_exam_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth all reports" ON public.school_exam_reports FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_exam_self_checks_review ON public.exam_student_self_checks(review_id);
CREATE INDEX IF NOT EXISTS idx_exam_self_checks_student ON public.exam_student_self_checks(student_id);
CREATE INDEX IF NOT EXISTS idx_school_exam_reports_lookup ON public.school_exam_reports(school_name, grade, subject, exam_year, exam_period);