
-- Add versioning columns to math_concept_quizzes
ALTER TABLE public.math_concept_quizzes 
  ADD COLUMN IF NOT EXISTS version_number integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS version_label text;

-- Add class_id to math_quiz_assignments for class-level assignments
ALTER TABLE public.math_quiz_assignments 
  ADD COLUMN IF NOT EXISTS class_id uuid REFERENCES public.classes(id) ON DELETE SET NULL;

-- Add unique constraint to prevent duplicate student+quiz assignments
ALTER TABLE public.math_quiz_assignments 
  ADD CONSTRAINT math_quiz_assignments_quiz_student_unique UNIQUE (quiz_id, student_id);
