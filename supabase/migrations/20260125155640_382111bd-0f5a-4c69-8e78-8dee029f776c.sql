-- WRITE-PERSIST-FIX-V1: Add test_content parameter to update_lesson_test_fields RPC
CREATE OR REPLACE FUNCTION public.update_lesson_test_fields(
  _lesson_id uuid,
  _test_name text DEFAULT NULL::text,
  _test_content text DEFAULT NULL::text,
  _test_result_text text DEFAULT NULL::text,
  _test_result text DEFAULT 'none'::text,
  _test_notes text DEFAULT NULL::text,
  _test_date date DEFAULT NULL::date,
  _test_time time without time zone DEFAULT NULL::time without time zone,
  _test_assistant text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Check if user has assistant or admin or teacher role
  IF NOT (
    has_role(auth.uid(), 'assistant') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'teacher')
  ) THEN
    RAISE EXCEPTION 'Unauthorized: only assistant, admin, or teacher can update test fields';
  END IF;
  
  -- Validate test_result
  IF _test_result NOT IN ('pass', 'fail', 'none') THEN
    RAISE EXCEPTION 'Invalid test_result value';
  END IF;

  -- Validate test_assistant if provided
  IF _test_assistant IS NOT NULL AND _test_assistant NOT IN ('다인조교', '유빈조교') THEN
    RAISE EXCEPTION 'Invalid test_assistant value';
  END IF;

  -- Update only test-related fields (WRITE-PERSIST-FIX-V1: Include test_content)
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

  RETURN FOUND;
END;
$function$;