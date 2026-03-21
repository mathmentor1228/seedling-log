ALTER TABLE public.study_sessions 
  ADD COLUMN IF NOT EXISTS test_content text,
  ADD COLUMN IF NOT EXISTS test_result text,
  ADD COLUMN IF NOT EXISTS linked_lesson_id uuid REFERENCES public.lesson_records(id) ON DELETE SET NULL;