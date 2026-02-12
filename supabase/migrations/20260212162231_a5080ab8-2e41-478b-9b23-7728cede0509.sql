
-- Add end_date and required_submissions to homework_assignments for range-based daily homework
ALTER TABLE public.homework_assignments
ADD COLUMN end_date date,
ADD COLUMN required_submissions integer NOT NULL DEFAULT 1;

-- Add comment for clarity
COMMENT ON COLUMN public.homework_assignments.end_date IS 'End date for range-based homework (null = single day)';
COMMENT ON COLUMN public.homework_assignments.required_submissions IS 'Number of times student must submit within the date range';
