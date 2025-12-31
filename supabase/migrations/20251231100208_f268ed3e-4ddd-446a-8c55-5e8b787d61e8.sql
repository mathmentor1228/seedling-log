-- Add test_time column to lesson_records
ALTER TABLE public.lesson_records 
ADD COLUMN IF NOT EXISTS test_time TIME NULL;

-- Update the RPC function to include test_time
CREATE OR REPLACE FUNCTION public.update_lesson_test_fields(
  _lesson_id uuid, 
  _test_name text DEFAULT NULL::text, 
  _test_result_text text DEFAULT NULL::text, 
  _test_result text DEFAULT 'none'::text, 
  _test_notes text DEFAULT NULL::text, 
  _test_date date DEFAULT NULL::date,
  _test_time time DEFAULT NULL::time
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

  -- Update only test-related fields
  UPDATE public.lesson_records
  SET 
    test_name = COALESCE(_test_name, test_name),
    test_result_text = COALESCE(_test_result_text, test_result_text),
    test_result = _test_result,
    test_notes = COALESCE(_test_notes, test_notes),
    test_date = COALESCE(_test_date, test_date),
    test_time = _test_time,
    updated_at = now()
  WHERE id = _lesson_id;

  RETURN FOUND;
END;
$function$;