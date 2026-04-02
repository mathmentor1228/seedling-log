-- Drop existing check constraint
ALTER TABLE public.students DROP CONSTRAINT IF EXISTS students_enrollment_status_check;

-- Update existing data to new values
UPDATE public.students SET enrollment_status = '재학' WHERE enrollment_status IN ('재원', '재원예정');
UPDATE public.students SET enrollment_status = '휴학' WHERE enrollment_status = '휴원';

-- Add new check constraint with updated values
ALTER TABLE public.students ADD CONSTRAINT students_enrollment_status_check
  CHECK (enrollment_status IN ('재학', '휴학', '퇴원'));

-- Add course_status column
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS course_status text NOT NULL DEFAULT '활성';

-- Add check constraint for course_status
ALTER TABLE public.students ADD CONSTRAINT students_course_status_check
  CHECK (course_status IN ('활성', '중단', '종료'));