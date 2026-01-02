-- Add columns for previous homework override
ALTER TABLE public.lesson_records
ADD COLUMN prev_homework_override_text TEXT,
ADD COLUMN prev_homework_override_by UUID,
ADD COLUMN prev_homework_override_at TIMESTAMPTZ;

-- Add comment for documentation
COMMENT ON COLUMN public.lesson_records.prev_homework_override_text IS 'Manual override for previous homework content by assistant/admin';
COMMENT ON COLUMN public.lesson_records.prev_homework_override_by IS 'User who set the override';
COMMENT ON COLUMN public.lesson_records.prev_homework_override_at IS 'Timestamp when override was set';