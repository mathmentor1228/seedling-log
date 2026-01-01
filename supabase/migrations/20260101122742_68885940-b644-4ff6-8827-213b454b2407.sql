-- Clean up duplicate lesson records (keep the most recent by created_at)
-- Delete all but the newest record for each (student_id, lesson_date, subject, class_id) combo
DELETE FROM public.lesson_records
WHERE id IN (
  SELECT id FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY student_id, lesson_date, subject, class_id 
             ORDER BY created_at DESC
           ) as rn
    FROM public.lesson_records
    WHERE class_id IS NOT NULL
  ) sub
  WHERE rn > 1
);

-- Now add unique index to prevent future duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_lesson_records_no_duplicate 
ON public.lesson_records (student_id, lesson_date, subject, class_id)
WHERE class_id IS NOT NULL;