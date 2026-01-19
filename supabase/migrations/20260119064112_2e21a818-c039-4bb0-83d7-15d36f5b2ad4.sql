-- Allow NULL for understanding_score to support absences, test-only visits, and holidays
-- Previously was NOT NULL with default 3

ALTER TABLE public.lesson_records
  ALTER COLUMN understanding_score DROP NOT NULL;

-- Add a comment for documentation
COMMENT ON COLUMN public.lesson_records.understanding_score IS 'Learning comprehension score 1-5. NULL for absences, test-only visits, or holidays.';