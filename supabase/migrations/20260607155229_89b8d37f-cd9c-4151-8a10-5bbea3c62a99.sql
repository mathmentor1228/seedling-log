
ALTER TABLE public.lesson_records
  ADD COLUMN IF NOT EXISTS weekly_summary text,
  ADD COLUMN IF NOT EXISTS weekly_summary_week date,
  ADD COLUMN IF NOT EXISTS is_common_entry boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS lesson_records_weekly_summary_idx
  ON public.lesson_records (teacher_id, student_id, weekly_summary_week)
  WHERE weekly_summary IS NOT NULL;
