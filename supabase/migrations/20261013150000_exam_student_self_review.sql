-- EXAM-SELF-REVIEW-V1 (2026-10-13, vault 19 §21) — 피드백 흐름 간소화
-- 학생이 학생 앱에서 틀린 번호·이유·다짐을 직접 적는다(셀프 피드백) → 담당 교사 면담 후 메모 한 칸 → 원장 공개(일괄).
-- 상태는 시각으로 판정: student_submitted_at(학생 제출) → counseled_at(면담 완료) → status='published'(공개).
-- teacher_confirmed 상태는 옛 행 호환을 위해 CHECK에 남기되 UI에서는 쓰지 않는다.

-- 1) 틀린 문항: 누가 표시했나 (학생 셀프 / 교사 폴백)
ALTER TABLE public.exam_result_items
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'teacher';
DO $$ BEGIN
  ALTER TABLE public.exam_result_items ADD CONSTRAINT exam_result_items_source_check CHECK (source IN ('student','teacher'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) 분석 행: 학생 다짐·제출 시각, 면담 완료 시각
ALTER TABLE public.exam_student_analyses
  ADD COLUMN IF NOT EXISTS student_reflection text,          -- "다음 시험까지 내가 할 것" (학생이 씀)
  ADD COLUMN IF NOT EXISTS student_submitted_at timestamptz, -- 학생 셀프 피드백 제출 시각
  ADD COLUMN IF NOT EXISTS counseled_at timestamptz,         -- 담당 교사 면담 완료(메모 저장) 시각
  ADD COLUMN IF NOT EXISTS counseled_by uuid;

CREATE INDEX IF NOT EXISTS exam_student_analyses_stage_idx
  ON public.exam_student_analyses(status, counseled_at, student_submitted_at);

COMMENT ON TABLE public.exam_student_analyses IS
  'EXAM-SELF-REVIEW-V1: 학생 셀프 피드백(student_submitted_at) → 교사 면담 메모(counseled_at, academy_action_text) → 원장 공개(published, 트리거 가드). teacher_confirmed는 옛 행 호환용.';
COMMENT ON COLUMN public.exam_result_items.source IS 'student = 학생 앱 셀프 피드백, teacher = 교사가 패널에서 대신 표시';
