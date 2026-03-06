
CREATE TABLE public.student_vocab_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  word_set_id uuid NOT NULL REFERENCES public.vocab_word_sets(id) ON DELETE CASCADE,
  assigned_by uuid NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, word_set_id)
);

ALTER TABLE public.student_vocab_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage student_vocab_assignments"
  ON public.student_vocab_assignments FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
