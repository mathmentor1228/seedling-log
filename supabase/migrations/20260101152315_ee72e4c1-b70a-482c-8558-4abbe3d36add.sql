-- RPC: teacher roster sheet for a given date (teacher-grouped)

CREATE OR REPLACE FUNCTION public.get_teacher_roster_sheet(_date date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := public.has_role(_caller, 'admin');
  _is_assistant boolean := public.has_role(_caller, 'assistant');
  _is_teacher boolean := public.has_role(_caller, 'teacher');
  _dow int;
  _teachers jsonb;
  _rows jsonb;
BEGIN
  IF NOT (_is_admin OR _is_assistant OR _is_teacher) THEN
    RAISE EXCEPTION 'Unauthorized: only admin, assistant, or teacher can call get_teacher_roster_sheet';
  END IF;

  -- Postgres DOW: 0=Sunday .. 6=Saturday (matches existing class_schedules usage)
  _dow := EXTRACT(DOW FROM _date)::int;

  -- Teachers list sourced from classes.teacher_id (avoid user_roles visibility)
  WITH teacher_ids AS (
    SELECT DISTINCT c.teacher_id
    FROM public.classes c
    WHERE c.teacher_id IS NOT NULL
      AND (NOT _is_teacher OR c.teacher_id = _caller)
  ),
  teachers AS (
    SELECT
      t.teacher_id,
      COALESCE(NULLIF(p.full_name, ''), p.email, '알 수 없음') AS teacher_name
    FROM teacher_ids t
    LEFT JOIN public.profiles p ON p.id = t.teacher_id
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'teacher_id', teacher_id,
        'teacher_name', teacher_name
      )
      ORDER BY teacher_name
    ),
    '[]'::jsonb
  )
  INTO _teachers
  FROM teachers;

  -- Roster rows for the given date
  WITH roster AS (
    SELECT
      c.teacher_id,
      COALESCE(NULLIF(p.full_name, ''), p.email, '알 수 없음') AS teacher_name,
      st.id AS student_id,
      st.name AS student_name,
      c.id AS class_id,
      c.name AS class_name,
      c.subject::text AS subject,
      s.start_time::text AS start_time,
      s.end_time::text AS end_time
    FROM public.class_schedules s
    JOIN public.classes c ON c.id = s.class_id
    JOIN public.class_students cs ON cs.class_id = c.id
    JOIN public.students st ON st.id = cs.student_id
    LEFT JOIN public.profiles p ON p.id = c.teacher_id
    WHERE s.is_active = true
      AND s.day_of_week = _dow
      AND c.teacher_id IS NOT NULL
      AND (NOT _is_teacher OR c.teacher_id = _caller)
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'teacher_id', teacher_id,
        'teacher_name', teacher_name,
        'student_id', student_id,
        'student_name', student_name,
        'class_id', class_id,
        'class_name', class_name,
        'subject', subject,
        'start_time', start_time,
        'end_time', end_time
      )
      ORDER BY teacher_name, start_time, class_name, student_name
    ),
    '[]'::jsonb
  )
  INTO _rows
  FROM roster;

  RETURN jsonb_build_object(
    'teachers', _teachers,
    'roster_rows', _rows
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_teacher_roster_sheet(date) TO authenticated;
