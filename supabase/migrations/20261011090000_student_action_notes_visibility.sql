-- STUDENT-ACTION-NOTES-V1.1 (2026-10-11): 조치 메모에 내부용/외부용(학부모 공유 가능) 구분 추가.
-- 20261010180000_student_action_notes.sql 적용 여부와 무관하게 안전(IF NOT EXISTS).
ALTER TABLE public.student_action_notes
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';
DO $$ BEGIN
  ALTER TABLE public.student_action_notes ADD CONSTRAINT student_action_notes_visibility_chk CHECK (visibility IN ('internal', 'external'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.student_action_notes.visibility IS 'internal=학원 내부용, external=학부모 상담에서 말해도 되는 내용';
