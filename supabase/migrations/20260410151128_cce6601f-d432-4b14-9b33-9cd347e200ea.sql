-- Add columns to vocab_card_completions for self-test tracking
ALTER TABLE public.vocab_card_completions
  ADD COLUMN IF NOT EXISTS is_self_test boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS test_source text NOT NULL DEFAULT 'assigned',
  ADD COLUMN IF NOT EXISTS notified_teacher_id uuid DEFAULT NULL;

-- Add index for teacher notification queries
CREATE INDEX IF NOT EXISTS idx_vocab_completions_teacher_notify 
  ON public.vocab_card_completions(notified_teacher_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_vocab_completions_self_test
  ON public.vocab_card_completions(student_id, is_self_test, completed_at DESC);