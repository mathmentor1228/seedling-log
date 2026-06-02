-- AUTOVOCA-SPRINT2-A2/A3: 단어별 숙련도 + SM-2 망각곡선 스케줄러
-- 학생 단위로 단어별 학습 상태(숙련도 0~5)와 SM-2 복습 스케줄을 보관한다.
-- 학생 앱은 student-data 엣지 함수(service_role)로만 접근한다.
-- 교사/관리자 접근은 형제 테이블 vocab_card_completions 와 동일 컨벤션(authenticated 허용)을 따른다.

CREATE TABLE IF NOT EXISTS public.student_word_mastery (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  word_key TEXT NOT NULL,                 -- lower(trim(english)) 정규화 키
  english TEXT NOT NULL,                  -- 표시용 원본 영단어
  meaning TEXT,                           -- 최근 학습 시점의 뜻(표시용)
  level SMALLINT NOT NULL DEFAULT 0,      -- 숙련도 0~5 (학생 표시용)
  correct_count INTEGER NOT NULL DEFAULT 0,
  wrong_count INTEGER NOT NULL DEFAULT 0,
  -- SM-2 스케줄링 필드
  ease_factor REAL NOT NULL DEFAULT 2.5,
  interval_days REAL NOT NULL DEFAULT 0,
  repetitions INTEGER NOT NULL DEFAULT 0,
  last_seen_at TIMESTAMPTZ,
  next_due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT student_word_mastery_unique UNIQUE (student_id, word_key)
);

-- "오늘 복습할 단어" 큐 조회 및 학생별 조회 최적화
CREATE INDEX IF NOT EXISTS idx_student_word_mastery_due
  ON public.student_word_mastery (student_id, next_due_at);
CREATE INDEX IF NOT EXISTS idx_student_word_mastery_student
  ON public.student_word_mastery (student_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_word_mastery TO authenticated;
GRANT ALL ON public.student_word_mastery TO service_role;

ALTER TABLE public.student_word_mastery ENABLE ROW LEVEL SECURITY;

-- 학생은 service_role 엣지 함수로만 접근. 교직원(authenticated)은 조회/관리 허용
-- (형제 테이블 vocab_card_completions 정책과 동일 컨벤션)
DROP POLICY IF EXISTS "Authenticated users can manage student_word_mastery" ON public.student_word_mastery;
CREATE POLICY "Authenticated users can manage student_word_mastery"
ON public.student_word_mastery FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);

DROP TRIGGER IF EXISTS update_student_word_mastery_updated_at ON public.student_word_mastery;
CREATE TRIGGER update_student_word_mastery_updated_at
BEFORE UPDATE ON public.student_word_mastery
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
