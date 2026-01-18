-- Drop the 2-param versions that cause ambiguity (keep only 3-param with DEFAULT NULL)
DROP FUNCTION IF EXISTS public.generate_weekly_reports(date, date);
DROP FUNCTION IF EXISTS public.generate_weekly_reports_scheduled(date, date);

-- The remaining functions are:
-- public.generate_weekly_reports(_week_start date, _week_end date, _student_ids uuid[] DEFAULT NULL)
-- public.generate_weekly_reports_scheduled(_week_start date, _week_end date, _student_ids uuid[] DEFAULT NULL)
-- These will work for both 2-param and 3-param calls due to the DEFAULT