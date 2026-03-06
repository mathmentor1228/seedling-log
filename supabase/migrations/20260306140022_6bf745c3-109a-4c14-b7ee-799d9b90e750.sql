
-- Track each flashcard round completion by a student
CREATE TABLE public.vocab_card_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  word_set_ids uuid[] NOT NULL DEFAULT '{}',
  correct_count integer NOT NULL DEFAULT 0,
  wrong_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  mode text NOT NULL DEFAULT 'eng_to_kor',
  completed_at timestamptz NOT NULL DEFAULT now()
);

-- Add required_rounds to assignments so teachers can set homework targets
ALTER TABLE public.student_vocab_assignments
  ADD COLUMN required_rounds integer NOT NULL DEFAULT 0;

-- RLS: no direct access (students use edge function), admins/teachers can read
ALTER TABLE public.vocab_card_completions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage vocab_card_completions"
  ON public.vocab_card_completions
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
