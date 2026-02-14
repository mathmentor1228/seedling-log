
-- Add created_by column to homework_assignments
ALTER TABLE public.homework_assignments
ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Backfill existing daily homework: use student_subject_teachers mapping
UPDATE public.homework_assignments ha
SET created_by = (
  SELECT sst.teacher_id
  FROM student_subject_teachers sst
  WHERE sst.student_id = ha.student_id
    AND sst.subject = ha.subject::text
  LIMIT 1
)
WHERE ha.created_by IS NULL
  AND ha.homework_type = 'daily';

-- Backfill existing regular homework: use lesson_records teacher_id
UPDATE public.homework_assignments ha
SET created_by = (
  SELECT lr.teacher_id
  FROM lesson_records lr
  WHERE lr.id = ha.lesson_record_id
  LIMIT 1
)
WHERE ha.created_by IS NULL
  AND ha.lesson_record_id IS NOT NULL;
