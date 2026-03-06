
CREATE TABLE public.vocab_generated_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  test_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  eng_to_kor_percent integer NOT NULL DEFAULT 50,
  question_count integer NOT NULL DEFAULT 20,
  source_set_ids uuid[] NOT NULL DEFAULT '{}',
  share_token text UNIQUE,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  notes text
);

ALTER TABLE public.vocab_generated_tests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage vocab_generated_tests"
  ON public.vocab_generated_tests FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Function to generate a short share token
CREATE OR REPLACE FUNCTION public.generate_vocab_test_token()
RETURNS text
LANGUAGE sql
AS $$
  SELECT substr(md5(random()::text || clock_timestamp()::text), 1, 12);
$$;
