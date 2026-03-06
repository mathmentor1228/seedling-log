
CREATE TABLE public.vocab_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES public.vocab_folders(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.vocab_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage vocab_folders"
  ON public.vocab_folders FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.vocab_word_sets ADD COLUMN folder_id uuid REFERENCES public.vocab_folders(id) ON DELETE SET NULL;
