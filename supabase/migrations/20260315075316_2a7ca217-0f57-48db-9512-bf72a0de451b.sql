
-- Textbook library tables
CREATE TABLE public.textbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  publisher text,
  subject text NOT NULL DEFAULT '수학',
  grade text,
  course text,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view textbooks" ON public.textbooks
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','teacher','assistant'))
  );

CREATE POLICY "Admin/teacher can manage textbooks" ON public.textbooks
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','teacher'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','teacher'))
  );

-- Textbook examples table
CREATE TABLE public.textbook_examples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  textbook_id uuid NOT NULL REFERENCES public.textbooks(id) ON DELETE CASCADE,
  chapter text NOT NULL,
  page_number integer,
  problem_number text,
  question_text text NOT NULL,
  answer text,
  explanation text,
  difficulty text DEFAULT 'medium',
  graph_data jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.textbook_examples ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view textbook_examples" ON public.textbook_examples
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','teacher','assistant'))
  );

CREATE POLICY "Admin/teacher can manage textbook_examples" ON public.textbook_examples
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','teacher'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin','teacher'))
  );

CREATE INDEX idx_textbook_examples_textbook_id ON public.textbook_examples(textbook_id);
CREATE INDEX idx_textbook_examples_chapter ON public.textbook_examples(chapter);
