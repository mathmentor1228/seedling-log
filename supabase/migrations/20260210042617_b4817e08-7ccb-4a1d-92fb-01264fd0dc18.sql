-- Add homework_type column to distinguish regular vs daily homework
ALTER TABLE public.homework_assignments
ADD COLUMN homework_type text NOT NULL DEFAULT 'regular';

-- Add index for efficient filtering
CREATE INDEX idx_homework_assignments_type ON public.homework_assignments(homework_type);

COMMENT ON COLUMN public.homework_assignments.homework_type IS 'Type of homework: regular (from lesson), daily (daily assignment)';
