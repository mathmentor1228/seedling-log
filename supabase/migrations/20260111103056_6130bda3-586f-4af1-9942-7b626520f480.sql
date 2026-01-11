-- Add scheduler_source column to weekly_jobs_log table
ALTER TABLE public.weekly_jobs_log 
ADD COLUMN IF NOT EXISTS scheduler_source text DEFAULT 'pg_cron';

-- Update existing records to have the scheduler_source
UPDATE public.weekly_jobs_log 
SET scheduler_source = 'pg_cron' 
WHERE scheduler_source IS NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.weekly_jobs_log.scheduler_source IS 'Source of the scheduler: pg_cron, edge_function, manual';