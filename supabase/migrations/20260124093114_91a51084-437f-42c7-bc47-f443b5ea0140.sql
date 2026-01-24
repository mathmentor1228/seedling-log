-- Step 1: Remove duplicate weekly_reports, keeping only the most recent per (student_id, week_start)
DELETE FROM public.weekly_reports a
USING public.weekly_reports b
WHERE a.student_id = b.student_id
  AND a.week_start = b.week_start
  AND a.generated_at < b.generated_at;

-- Step 2: Add the unique constraint for upsert to work
ALTER TABLE public.weekly_reports
  ADD CONSTRAINT weekly_reports_student_week_unique UNIQUE (student_id, week_start);