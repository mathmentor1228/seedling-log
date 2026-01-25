-- TEST-CONTENT-REQUIRED-V1: Add test_content column for test scope/description
-- This is distinct from test_result_text (which stores score/result)

-- Add test_content column if not exists
ALTER TABLE public.lesson_records
ADD COLUMN IF NOT EXISTS test_content TEXT NULL;

-- Add comment for documentation
COMMENT ON COLUMN public.lesson_records.test_content IS 'Test scope/content description (what was tested). Required when adding test records.';