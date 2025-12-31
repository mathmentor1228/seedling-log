-- Add student_code column to students table
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS student_code TEXT;

-- Create unique index on student_code where not null
CREATE UNIQUE INDEX IF NOT EXISTS students_student_code_unique 
ON public.students (student_code) 
WHERE student_code IS NOT NULL;