CREATE OR REPLACE FUNCTION public.get_teacher_roster_sheet(_date date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result JSON;
  _caller UUID := auth.uid();
  _is_admin BOOLEAN;
  _is_teacher BOOLEAN;
  _dow INT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'admin'
  ) INTO _is_admin;
  
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _caller AND role = 'teacher'
  ) INTO _is_teacher;
  
  _dow := EXTRACT(DOW FROM _date)::INT;
  
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
      AND st.enrollment_status != '퇴원'
      AND (_is_admin OR NOT _is_teacher OR c.teacher_id = _caller)
    ORDER BY s.start_time, c.name, st.name
  ) t;
  
  RETURN COALESCE(_result, '[]'::JSON);
END;
$function$;