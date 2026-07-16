CREATE TABLE IF NOT EXISTS public.student_book_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  textbook_id uuid REFERENCES public.textbooks(id) ON DELETE SET NULL,
  book_title text NOT NULL,
  subject text NOT NULL DEFAULT '수학',
  book_role text NOT NULL DEFAULT '유형',
  total_pages int,
  current_page int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',
  last_source text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, book_title)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_book_progress TO authenticated;
GRANT ALL ON public.student_book_progress TO service_role;

ALTER TABLE public.student_book_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff full access" ON public.student_book_progress
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE public.textbooks ADD COLUMN IF NOT EXISTS toc jsonb;
ALTER TABLE public.textbooks ADD COLUMN IF NOT EXISTS total_pages int;