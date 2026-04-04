-- Add author column to school_textbooks
ALTER TABLE public.school_textbooks ADD COLUMN IF NOT EXISTS author TEXT;

-- Add course_name column to school_exam_archives (세부 과정명: 공통수학1, 대수, 미적분 등)
ALTER TABLE public.school_exam_archives ADD COLUMN IF NOT EXISTS course_name TEXT;

-- Add course_name column to school_textbooks
ALTER TABLE public.school_textbooks ADD COLUMN IF NOT EXISTS course_name TEXT;