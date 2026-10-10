ALTER TABLE public.student_action_notes
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';
DO $$ BEGIN
  ALTER TABLE public.student_action_notes ADD CONSTRAINT student_action_notes_visibility_chk CHECK (visibility IN ('internal', 'external'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON COLUMN public.student_action_notes.visibility IS 'internal=학원 내부용, external=학부모 상담에서 말해도 되는 내용';