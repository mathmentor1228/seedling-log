-- D) Add test fields to lesson_records
ALTER TABLE public.lesson_records
  ADD COLUMN IF NOT EXISTS test_name TEXT,
  ADD COLUMN IF NOT EXISTS test_result_text TEXT,
  ADD COLUMN IF NOT EXISTS test_result TEXT NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS test_notes TEXT,
  ADD COLUMN IF NOT EXISTS test_date DATE;

-- Add check constraint for test_result
ALTER TABLE public.lesson_records
  DROP CONSTRAINT IF EXISTS lesson_records_test_result_check;
ALTER TABLE public.lesson_records
  ADD CONSTRAINT lesson_records_test_result_check
  CHECK (test_result IN ('pass', 'fail', 'none'));

-- E) Create security definer RPC for assistants to update test fields on lesson_records
CREATE OR REPLACE FUNCTION public.update_lesson_test_fields(
  _lesson_id UUID,
  _test_name TEXT DEFAULT NULL,
  _test_result_text TEXT DEFAULT NULL,
  _test_result TEXT DEFAULT 'none',
  _test_notes TEXT DEFAULT NULL,
  _test_date DATE DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    updated_at = now()
  WHERE id = _lesson_id;

  RETURN FOUND;
END;
$$;

-- B/E) RLS policies for homework_assignments - update for assistant role

-- Drop existing teacher policies that need modification
DROP POLICY IF EXISTS "Teachers can view their students homework" ON public.homework_assignments;
DROP POLICY IF EXISTS "Teachers can update homework check for their students" ON public.homework_assignments;

-- Create new SELECT policy for teachers (their students only)
CREATE POLICY "Teachers can view their students homework"
ON public.homework_assignments
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher') 
  AND teacher_owns_student(auth.uid(), student_id)
);

-- Create new SELECT policy for assistants (all students, last 7 days)
CREATE POLICY "Assistants can view homework within 7 days"
ON public.homework_assignments
FOR SELECT
USING (
  has_role(auth.uid(), 'assistant') 
  AND assigned_date >= (current_date - interval '7 days')
);

-- Create new UPDATE policy for teachers (their students only)
CREATE POLICY "Teachers can update homework check for their students"
ON public.homework_assignments
FOR UPDATE
USING (
  has_role(auth.uid(), 'teacher') 
  AND teacher_owns_student(auth.uid(), student_id)
);

-- Create new UPDATE policy for assistants (check fields only, last 7 days)
CREATE POLICY "Assistants can update homework check within 7 days"
ON public.homework_assignments
FOR UPDATE
USING (
  has_role(auth.uid(), 'assistant') 
  AND assigned_date >= (current_date - interval '7 days')
);

-- B) Additional RLS for assistants on other tables

-- Assistants can view students (but no contact details - handled at application level)
CREATE POLICY "Assistants can view students"
ON public.students
FOR SELECT
USING (has_role(auth.uid(), 'assistant'));

-- Assistants can view lesson_records (for test field updates)
CREATE POLICY "Assistants can view lesson_records"
ON public.lesson_records
FOR SELECT
USING (has_role(auth.uid(), 'assistant'));

-- Assistants can view classes
CREATE POLICY "Assistants can view classes"
ON public.classes
FOR SELECT
USING (has_role(auth.uid(), 'assistant'));

-- Assistants can view profiles (for checker names)
CREATE POLICY "Assistants can view profiles"
ON public.profiles
FOR SELECT
USING (has_role(auth.uid(), 'assistant'));

-- Assistants can view weekly_reports
CREATE POLICY "Assistants can view weekly_reports"
ON public.weekly_reports
FOR SELECT
USING (has_role(auth.uid(), 'assistant'));

-- Create RPC for assistants to update homework check fields only
CREATE OR REPLACE FUNCTION public.update_homework_check(
  _homework_id UUID,
  _check_status TEXT,
  _result TEXT,
  _notes TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hw_assigned_date DATE;
BEGIN
  -- Check if user has assistant or admin or teacher role
  IF NOT (
    has_role(auth.uid(), 'assistant') OR 
    has_role(auth.uid(), 'admin') OR 
    has_role(auth.uid(), 'teacher')
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  
  -- For assistants, verify homework is within 7 days
  IF has_role(auth.uid(), 'assistant') THEN
    SELECT assigned_date INTO _hw_assigned_date 
    FROM public.homework_assignments 
    WHERE id = _homework_id;
    
    IF _hw_assigned_date < (current_date - interval '7 days') THEN
      RAISE EXCEPTION 'Homework is older than 7 days';
    END IF;
  END IF;

  -- Update only check-related fields
  UPDATE public.homework_assignments
  SET 
    check_status = _check_status,
    result = _result,
    notes = _notes,
    checked_by = auth.uid(),
    checked_at = now()
  WHERE id = _homework_id;

  RETURN FOUND;
END;
$$;