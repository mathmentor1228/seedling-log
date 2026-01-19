-- KOREAN-CATEGORY-V1: Add korean_categories column for 국어 subject
ALTER TABLE public.lesson_records
ADD COLUMN IF NOT EXISTS korean_categories TEXT[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.lesson_records.korean_categories IS 'KOREAN-CATEGORY-V1: Multi-select categories for 국어 subject (e.g., 고1 문학, 평가원 기출 독서)';