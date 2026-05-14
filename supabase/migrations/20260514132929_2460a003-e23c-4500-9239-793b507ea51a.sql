
ALTER TABLE public.vocab_card_completions
  ADD COLUMN IF NOT EXISTS teacher_corrected_at timestamptz,
  ADD COLUMN IF NOT EXISTS teacher_corrected_by uuid,
  ADD COLUMN IF NOT EXISTS teacher_correction_note text,
  ADD COLUMN IF NOT EXISTS original_correct_count integer,
  ADD COLUMN IF NOT EXISTS original_wrong_count integer;
