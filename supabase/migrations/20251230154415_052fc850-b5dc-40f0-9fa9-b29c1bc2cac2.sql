-- Normalize existing classes.subject values to match enum before converting
UPDATE public.classes
SET subject = CASE
  WHEN subject ILIKE '%수학%' THEN '수학'
  WHEN subject ILIKE '%과학%' THEN '과학'
  WHEN subject ILIKE '%영어%' THEN '영어'
  WHEN subject ILIKE '%국어%' THEN '국어'
  ELSE '수학'
END;

-- Change classes.subject column type to use the enum
ALTER TABLE public.classes
  ALTER COLUMN subject TYPE subject_type
  USING subject::subject_type;