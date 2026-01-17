-- CLASS-ACTIVE-TOGGLE-V1: Add inactive_until and inactive_reason columns to class_schedules

-- Add columns for temporary deactivation with optional auto-reactivation
ALTER TABLE public.class_schedules 
ADD COLUMN IF NOT EXISTS inactive_until DATE NULL,
ADD COLUMN IF NOT EXISTS inactive_reason TEXT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.class_schedules.inactive_until IS 'Schedule is inactive through this date (inclusive). Auto-reactivates after this date.';
COMMENT ON COLUMN public.class_schedules.inactive_reason IS 'Reason for temporary deactivation';

-- Drop and recreate the get_teacher_roster_sheet function to use the new active rule
DROP FUNCTION IF EXISTS public.get_teacher_roster_sheet(DATE);

CREATE FUNCTION public.get_teacher_roster_sheet(_date DATE DEFAULT CURRENT_DATE)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result JSON;
  _caller UUID := auth.uid();
  _is_admin BOOLEAN;
  _is_teacher BOOLEAN;
  _dow INT;
BEGIN
  -- Get caller's roles
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'admin'
  ) INTO _is_admin;
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'teacher'
  ) INTO _is_teacher;
  
  -- Get day of week (0=Sunday, 6=Saturday)
  _dow := EXTRACT(DOW FROM _date)::INT;
  
  -- Build the roster with inactive_until check
  -- Rule: slot is active if is_active = true AND (inactive_until IS NULL OR inactive_until < _date)
  SELECT json_agg(row_to_json(t))
  INTO _result
  FROM (
    SELECT
      c.id AS class_id,
      c.name AS class_name,
      c.subject,
      c.teacher_id,
      p.full_name AS teacher_name,
      st.id AS student_id,
      st.name AS student_name,
      s.start_time::text AS start_time,
      s.end_time::text AS end_time
    FROM public.class_schedules s
    JOIN public.classes c ON c.id = s.class_id
    JOIN public.class_students cs ON cs.class_id = c.id
    JOIN public.students st ON st.id = cs.student_id
    LEFT JOIN public.profiles p ON p.id = c.teacher_id
    WHERE s.is_active = true
      AND (s.inactive_until IS NULL OR s.inactive_until < _date)
      AND s.day_of_week = _dow
      AND c.teacher_id IS NOT NULL
      AND (NOT _is_teacher OR c.teacher_id = _caller)
    ORDER BY s.start_time, c.name, st.name
  ) t;
  
  RETURN COALESCE(_result, '[]'::JSON);
END;
$$;