
-- 1. Add grade/course to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_grade text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS student_course text;

-- 2. Math concepts table
CREATE TABLE public.math_concepts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  grade text NOT NULL,
  course text NOT NULL,
  title text NOT NULL,
  pdf_storage_path text NOT NULL,
  pdf_original_name text NOT NULL,
  pdf_file_size integer,
  extracted_text text,
  status text NOT NULL DEFAULT 'uploaded',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.math_concepts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on math_concepts" ON public.math_concepts
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 3. Math concept quizzes table
CREATE TABLE public.math_concept_quizzes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  concept_id uuid REFERENCES public.math_concepts(id) ON DELETE CASCADE NOT NULL,
  questions jsonb NOT NULL DEFAULT '[]',
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.math_concept_quizzes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access on math_concept_quizzes" ON public.math_concept_quizzes
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4. Storage bucket for math concept PDFs
INSERT INTO storage.buckets (id, name, public) VALUES ('math-concepts', 'math-concepts', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Admin can upload math concepts" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'math-concepts' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can read math concepts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'math-concepts' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admin can delete math concepts" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'math-concepts' AND public.has_role(auth.uid(), 'admin'));
