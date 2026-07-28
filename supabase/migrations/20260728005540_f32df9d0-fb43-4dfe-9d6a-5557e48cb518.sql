CREATE TABLE IF NOT EXISTS public.student_book_progress_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  book_progress_id uuid REFERENCES public.student_book_progress(id) ON DELETE SET NULL,
  book_title text NOT NULL,
  subject text NOT NULL DEFAULT '수학',
  book_role text,
  progress_date date NOT NULL DEFAULT CURRENT_DATE,
  from_page int,
  to_page int NOT NULL,
  source text NOT NULL DEFAULT 'lesson',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbpl_student_date ON public.student_book_progress_log(student_id, progress_date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_book_progress_log TO authenticated;
GRANT ALL ON public.student_book_progress_log TO service_role;
ALTER TABLE public.student_book_progress_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON public.student_book_progress_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);