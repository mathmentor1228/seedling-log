-- Add test_title column to lesson_records if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lesson_records' 
    AND column_name = 'test_title'
  ) THEN
    ALTER TABLE public.lesson_records ADD COLUMN test_title TEXT NULL;
  END IF;
END $$;