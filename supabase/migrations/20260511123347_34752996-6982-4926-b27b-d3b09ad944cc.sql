ALTER TABLE public.vocab_card_completions
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS expected_seconds integer,
  ADD COLUMN IF NOT EXISTS self_test_options jsonb;

CREATE INDEX IF NOT EXISTS idx_vocab_completions_self_recent
  ON public.vocab_card_completions(notified_teacher_id, is_self_test, completed_at DESC);