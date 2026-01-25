-- Migration: Add school_level, grade_year, enrollment_status to students
-- Markers: STATS-SCHOOL-GRADE-V1, STUDENT-ENROLLMENT-STATUS-V1

-- 1. Add school_level column (초/중/고)
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS school_level TEXT
CHECK (school_level IS NULL OR school_level IN ('초', '중', '고'));

-- 2. Add grade_year column (1-6 for primary, 1-3 for middle/high)
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS grade_year INTEGER
CHECK (grade_year IS NULL OR grade_year BETWEEN 1 AND 6);

-- 3. Add enrollment_status column (재원/휴원/퇴원)
ALTER TABLE public.students
ADD COLUMN IF NOT EXISTS enrollment_status TEXT NOT NULL DEFAULT '재원'
CHECK (enrollment_status IN ('재원', '휴원', '퇴원'));

-- 4. Create index for faster filtering
CREATE INDEX IF NOT EXISTS idx_students_enrollment_status ON public.students(enrollment_status);
CREATE INDEX IF NOT EXISTS idx_students_school_level ON public.students(school_level);

-- 5. Migrate existing grade data to school_level + grade_year where possible
-- Parse existing "grade" column (e.g., "중2", "고1", "초3") into components
UPDATE public.students
SET 
  school_level = CASE 
    WHEN grade ~ '^초[1-6]$' THEN '초'
    WHEN grade ~ '^중[1-3]$' THEN '중'
    WHEN grade ~ '^고[1-3]$' THEN '고'
    ELSE school_level
  END,
  grade_year = CASE 
    WHEN grade ~ '^초[1-6]$' THEN SUBSTRING(grade FROM 2 FOR 1)::INTEGER
    WHEN grade ~ '^중[1-3]$' THEN SUBSTRING(grade FROM 2 FOR 1)::INTEGER
    WHEN grade ~ '^고[1-3]$' THEN SUBSTRING(grade FROM 2 FOR 1)::INTEGER
    ELSE grade_year
  END
WHERE grade IS NOT NULL 
  AND grade ~ '^(초|중|고)[1-6]$'
  AND school_level IS NULL;