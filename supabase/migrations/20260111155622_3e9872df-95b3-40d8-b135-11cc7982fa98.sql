-- WEEKLY-SCHED-VERIFY-V1: Add schedule_text column to weekly_jobs_log for verification UI
ALTER TABLE public.weekly_jobs_log 
ADD COLUMN IF NOT EXISTS schedule_text text DEFAULT 'Sat 22:00 KST';

-- Update existing records
UPDATE public.weekly_jobs_log 
SET schedule_text = 'Sat 22:00 KST' 
WHERE schedule_text IS NULL;

-- Add comment
COMMENT ON COLUMN public.weekly_jobs_log.schedule_text IS 'Human-readable schedule text for verification UI';