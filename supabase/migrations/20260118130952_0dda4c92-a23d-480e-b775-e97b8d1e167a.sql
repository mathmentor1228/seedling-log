-- Add debug_info column to weekly_reports for storing engine debug information
-- REPORT-ENGINE-DEBUG-V1

ALTER TABLE public.weekly_reports
ADD COLUMN IF NOT EXISTS debug_info TEXT;