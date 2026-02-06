
-- Add parent_visible flag to weekly_reports
ALTER TABLE public.weekly_reports 
ADD COLUMN IF NOT EXISTS parent_visible BOOLEAN NOT NULL DEFAULT false;
