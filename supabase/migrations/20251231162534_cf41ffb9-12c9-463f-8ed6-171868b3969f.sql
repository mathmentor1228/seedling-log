-- Add learning_issues_note column for free-text learning issues
ALTER TABLE public.lesson_records
ADD COLUMN IF NOT EXISTS learning_issues_note TEXT DEFAULT NULL;