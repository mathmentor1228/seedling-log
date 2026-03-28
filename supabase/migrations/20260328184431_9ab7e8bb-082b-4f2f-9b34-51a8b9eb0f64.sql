
ALTER TABLE public.vocab_word_items
  ADD COLUMN IF NOT EXISTS english_definition text;

ALTER TABLE public.vocab_generated_tests
  ADD COLUMN IF NOT EXISTS test_mode text NOT NULL DEFAULT 'ko';

ALTER TABLE public.vocab_generated_tests
  ADD COLUMN IF NOT EXISTS question_type text NOT NULL DEFAULT 'multiple_choice';

CREATE OR REPLACE FUNCTION public.validate_vocab_generated_tests_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $func$
BEGIN
  IF NEW.test_mode NOT IN ('ko', 'en') THEN
    RAISE EXCEPTION 'test_mode must be ko or en';
  END IF;
  IF NEW.question_type NOT IN ('multiple_choice', 'typing') THEN
    RAISE EXCEPTION 'question_type must be multiple_choice or typing';
  END IF;
  RETURN NEW;
END;
$func$;

DROP TRIGGER IF EXISTS trg_validate_vocab_generated_tests ON public.vocab_generated_tests;
CREATE TRIGGER trg_validate_vocab_generated_tests
  BEFORE INSERT OR UPDATE ON public.vocab_generated_tests
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_vocab_generated_tests_columns();
