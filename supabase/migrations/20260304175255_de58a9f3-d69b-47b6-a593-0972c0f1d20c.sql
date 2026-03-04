
-- Add new columns to school_exam_archives for comprehensive exam management
ALTER TABLE public.school_exam_archives
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT '자료수집전',
  ADD COLUMN IF NOT EXISTS performance_assessment_info text,
  ADD COLUMN IF NOT EXISTS grade_ratio text,
  ADD COLUMN IF NOT EXISTS difficulty_level text,
  ADD COLUMN IF NOT EXISTS exam_analysis_detail text,
  ADD COLUMN IF NOT EXISTS preparing_teachers text[],
  ADD COLUMN IF NOT EXISTS exam_average_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS academy_prep_notes text;
