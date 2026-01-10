-- Add english_pass_fail column to lesson_records if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'lesson_records' 
    AND column_name = 'english_pass_fail'
  ) THEN
    ALTER TABLE public.lesson_records 
    ADD COLUMN english_pass_fail TEXT NULL;
  END IF;
END $$;

-- Add a check constraint for english_pass_fail values
ALTER TABLE public.lesson_records 
DROP CONSTRAINT IF EXISTS lesson_records_english_pass_fail_check;

ALTER TABLE public.lesson_records 
ADD CONSTRAINT lesson_records_english_pass_fail_check 
CHECK (english_pass_fail IS NULL OR english_pass_fail IN ('pass', 'fail'));