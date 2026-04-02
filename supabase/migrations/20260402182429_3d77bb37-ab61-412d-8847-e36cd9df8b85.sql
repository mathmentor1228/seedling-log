-- Rename start_date to enrollment_date
ALTER TABLE public.student_courses RENAME COLUMN start_date TO enrollment_date;

-- Add is_active boolean column with default true
ALTER TABLE public.student_courses ADD COLUMN is_active boolean NOT NULL DEFAULT true;

-- Migrate existing status data to is_active
UPDATE public.student_courses SET is_active = (status = '활성');

-- Drop the old status column
ALTER TABLE public.student_courses DROP COLUMN status;