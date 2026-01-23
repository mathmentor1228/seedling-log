-- Add report_quality_tag column to weekly_reports
-- GREEN = passes validator, >=2 subjects with narrative
-- YELLOW = passes validator but limited data
-- RED = failed validator or too shallow

ALTER TABLE public.weekly_reports 
ADD COLUMN IF NOT EXISTS report_quality_tag text 
CHECK (report_quality_tag IN ('GREEN', 'YELLOW', 'RED'));

-- Add index for filtering by quality tag
CREATE INDEX IF NOT EXISTS idx_weekly_reports_quality_tag 
ON public.weekly_reports(report_quality_tag);