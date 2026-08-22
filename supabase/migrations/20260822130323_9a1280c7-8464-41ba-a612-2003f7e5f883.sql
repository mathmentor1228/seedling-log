ALTER TABLE public.team_notes
  ADD COLUMN IF NOT EXISTS consult_target text,
  ADD COLUMN IF NOT EXISTS consult_method text,
  ADD COLUMN IF NOT EXISTS consulted_at timestamptz;

COMMENT ON COLUMN public.team_notes.consult_target IS '상담 대상: 학생/학부모/기타 (상담 기록에서만 사용, 기존 행은 NULL 유지)';
COMMENT ON COLUMN public.team_notes.consult_method IS '상담 방식: 전화/대면/메신저/기타';
COMMENT ON COLUMN public.team_notes.consulted_at IS '실제 상담 일시(KST 입력값). NULL이면 상담 기록이 아님';

CREATE INDEX IF NOT EXISTS idx_team_notes_student_consulted
  ON public.team_notes (student_id, consulted_at DESC)
  WHERE student_id IS NOT NULL AND consulted_at IS NOT NULL;