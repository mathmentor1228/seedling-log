-- ENGLISH-CURRICULUM-V1: Add English curriculum fields to lesson_records

-- A) Add english_grammar_unit (single value, TEXT NULL)
ALTER TABLE public.lesson_records 
  ADD COLUMN IF NOT EXISTS english_grammar_unit TEXT NULL;

-- B) Add english_reading_units (multi-select array, TEXT[] NULL)
ALTER TABLE public.lesson_records 
  ADD COLUMN IF NOT EXISTS english_reading_units TEXT[] NULL;