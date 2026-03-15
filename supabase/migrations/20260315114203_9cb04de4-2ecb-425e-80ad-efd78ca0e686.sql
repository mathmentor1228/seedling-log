
ALTER TABLE public.math_concept_quizzes 
ADD COLUMN IF NOT EXISTS answer_code TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS title TEXT;

-- Create a function to auto-generate answer codes
CREATE OR REPLACE FUNCTION public.generate_quiz_answer_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _year TEXT;
  _seq INT;
  _code TEXT;
BEGIN
  IF NEW.answer_code IS NULL THEN
    _year := to_char(now(), 'YYYY');
    SELECT COALESCE(MAX(
      CASE WHEN answer_code ~ ('^MT-' || _year || '-\d+$')
        THEN CAST(split_part(answer_code, '-', 3) AS INT)
        ELSE 0
      END
    ), 0) + 1
    INTO _seq
    FROM public.math_concept_quizzes;
    _code := 'MT-' || _year || '-' || LPAD(_seq::TEXT, 3, '0');
    NEW.answer_code := _code;
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger
DROP TRIGGER IF EXISTS trg_quiz_answer_code ON public.math_concept_quizzes;
CREATE TRIGGER trg_quiz_answer_code
BEFORE INSERT ON public.math_concept_quizzes
FOR EACH ROW
EXECUTE FUNCTION public.generate_quiz_answer_code();
