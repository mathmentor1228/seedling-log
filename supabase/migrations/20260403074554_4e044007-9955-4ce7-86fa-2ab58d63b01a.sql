
-- Enable realtime for lesson_records
ALTER PUBLICATION supabase_realtime ADD TABLE public.lesson_records;

-- Add second test slot fields
ALTER TABLE public.lesson_records
  ADD COLUMN IF NOT EXISTS test_content_2 text,
  ADD COLUMN IF NOT EXISTS test_name_2 text,
  ADD COLUMN IF NOT EXISTS test_result_text_2 text,
  ADD COLUMN IF NOT EXISTS test_result_2 text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS english_pass_fail_2 text,
  ADD COLUMN IF NOT EXISTS test_assistant_2 text,
  ADD COLUMN IF NOT EXISTS test_date_2 date;

-- Drop existing overloads and recreate a unified version
DROP FUNCTION IF EXISTS public.update_lesson_test_fields(uuid, text, text, text, text, date);
DROP FUNCTION IF EXISTS public.update_lesson_test_fields(uuid, text, text, text, text, text, date, time, text);

CREATE OR REPLACE FUNCTION public.update_lesson_test_fields(
  _lesson_id uuid,
  _test_name text DEFAULT NULL,
  _test_content text DEFAULT NULL,
  _test_result_text text DEFAULT NULL,
  _test_result text DEFAULT 'none',
  _test_notes text DEFAULT NULL,
  _test_date date DEFAULT NULL,
  _test_time time DEFAULT NULL,
  _test_assistant text DEFAULT NULL,
  _test_slot int DEFAULT 1
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (
    has_role(auth.uid(), 'assistant') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'teacher')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only assistant, admin, or teacher can update test fields';
  END IF;
  
  IF _test_result NOT IN ('pass', 'fail', 'none') THEN
    RAISE EXCEPTION 'Invalid test_result value';
  END IF;

  IF _test_assistant IS NOT NULL AND _test_assistant NOT IN ('은서조교', '유빈조교', '다인조교') THEN
    RAISE EXCEPTION 'Invalid test_assistant value';
  END IF;

  IF _test_slot = 2 THEN
    UPDATE public.lesson_records
    SET 
      test_name_2 = COALESCE(_test_name, test_name_2),
      test_content_2 = COALESCE(_test_content, test_content_2),
      test_result_text_2 = COALESCE(_test_result_text, test_result_text_2),
      test_result_2 = _test_result,
      test_date_2 = COALESCE(_test_date, test_date_2),
      test_assistant_2 = _test_assistant,
      english_pass_fail_2 = CASE 
        WHEN _test_result = 'pass' THEN 'pass'
        WHEN _test_result = 'fail' THEN 'fail'
        ELSE NULL
      END,
      updated_at = now()
    WHERE id = _lesson_id;
  ELSE
    UPDATE public.lesson_records
    SET 
      test_name = COALESCE(_test_name, test_name),
      test_content = COALESCE(_test_content, test_content),
      test_result_text = COALESCE(_test_result_text, test_result_text),
      test_result = _test_result,
      test_notes = COALESCE(_test_notes, test_notes),
      test_date = COALESCE(_test_date, test_date),
      test_time = _test_time,
      test_assistant = _test_assistant,
      updated_at = now()
    WHERE id = _lesson_id;
  END IF;

  RETURN FOUND;
END;
$$;
