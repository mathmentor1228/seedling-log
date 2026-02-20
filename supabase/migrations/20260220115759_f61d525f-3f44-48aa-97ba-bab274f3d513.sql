
-- Add result tracking columns to test_schedules
ALTER TABLE public.test_schedules
ADD COLUMN result_score text DEFAULT NULL,
ADD COLUMN result_passed boolean DEFAULT NULL,
ADD COLUMN result_notes text DEFAULT NULL,
ADD COLUMN result_recorded_by uuid DEFAULT NULL,
ADD COLUMN result_recorded_at timestamp with time zone DEFAULT NULL;
