
-- Word sets (회차) table
CREATE TABLE public.vocab_word_sets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  round_number integer NOT NULL DEFAULT 1,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vocab_word_sets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage vocab_word_sets" ON public.vocab_word_sets
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Individual words in each set
CREATE TABLE public.vocab_word_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  set_id uuid NOT NULL REFERENCES public.vocab_word_sets(id) ON DELETE CASCADE,
  english text NOT NULL,
  meaning text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vocab_word_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage vocab_word_items" ON public.vocab_word_items
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
