-- Create RPC function for admin KPIs
-- ADMIN-STATS-V1: Returns aggregated statistics for admin dashboard
CREATE OR REPLACE FUNCTION public.get_admin_kpis(
  _start_date date,
  _end_date date,
  _teacher_id uuid DEFAULT NULL,
  _subject text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_admin boolean := public.has_role(_caller, 'admin');
  _result jsonb;
  _lesson_stats jsonb;
  _homework_stats jsonb;
  _attendance_stats jsonb;
  _top_exception_students jsonb;
  _teacher_breakdown jsonb;
BEGIN
  -- Only admin can access this function
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Unauthorized: only admin can access admin KPIs';
  END IF;

  -- 1. Lesson submission stats
  WITH lesson_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE submitted = true) AS submitted_count,
      COUNT(*) FILTER (WHERE submitted = false) AS draft_count,
      COUNT(*) AS total_count
    FROM public.lesson_records lr
    WHERE lr.lesson_date BETWEEN _start_date AND _end_date
      AND (_teacher_id IS NULL OR lr.teacher_id = _teacher_id)
      AND (_subject IS NULL OR lr.subject::text = _subject)
      AND NOT ('휴강' = ANY(COALESCE(lr.lesson_types, '{}')))
  )
  SELECT jsonb_build_object(
    'total', total_count,
    'submitted', submitted_count,
    'draft', draft_count,
    'submission_rate', CASE 
      WHEN total_count > 0 THEN ROUND((submitted_count::numeric / total_count) * 100, 1)
      ELSE 0
    END
  )
  INTO _lesson_stats
  FROM lesson_counts;

  -- 2. Homework status distribution
  WITH homework_counts AS (
    SELECT
      COUNT(*) FILTER (WHERE homework_status = 'completed') AS completed_count,
      COUNT(*) FILTER (WHERE homework_status = 'partial') AS partial_count,
      COUNT(*) FILTER (WHERE homework_status = 'not_done') AS not_done_count,
      COUNT(*) FILTER (WHERE homework_status = 'none_assigned' OR homework_status = '' OR homework_status IS NULL) AS none_assigned_count,
      COUNT(*) AS total_count
    FROM public.lesson_records lr
    WHERE lr.lesson_date BETWEEN _start_date AND _end_date
      AND lr.submitted = true
      AND (_teacher_id IS NULL OR lr.teacher_id = _teacher_id)
      AND (_subject IS NULL OR lr.subject::text = _subject)
      AND NOT ('휴강' = ANY(COALESCE(lr.lesson_types, '{}')))
  )
  SELECT jsonb_build_object(
    'completed', completed_count,
    'partial', partial_count,
    'not_done', not_done_count,
    'none_assigned', none_assigned_count,
    'total', total_count
  )
  INTO _homework_stats
  FROM homework_counts;

  -- 3. Attendance exceptions summary
  WITH exception_counts AS (
    SELECT
      COALESCE(SUM(CASE WHEN '지각' = ANY(COALESCE(attendance_status, '{}')) THEN 1 ELSE 0 END), 0) AS late_count,
      COALESCE(SUM(CASE WHEN '조퇴' = ANY(COALESCE(attendance_status, '{}')) THEN 1 ELSE 0 END), 0) AS early_leave_count,
      COALESCE(SUM(CASE WHEN '인정결석' = ANY(COALESCE(attendance_status, '{}')) THEN 1 ELSE 0 END), 0) AS excused_absence_count,
      COALESCE(SUM(CASE WHEN '무단결석' = ANY(COALESCE(attendance_status, '{}')) THEN 1 ELSE 0 END), 0) AS unexcused_absence_count,
      COALESCE(SUM(CASE WHEN '보충불가' = ANY(COALESCE(attendance_status, '{}')) THEN 1 ELSE 0 END), 0) AS no_makeup_count
    FROM public.lesson_records lr
    WHERE lr.lesson_date BETWEEN _start_date AND _end_date
      AND lr.submitted = true
      AND (_teacher_id IS NULL OR lr.teacher_id = _teacher_id)
      AND (_subject IS NULL OR lr.subject::text = _subject)
  )
  SELECT jsonb_build_object(
    '지각', late_count,
    '조퇴', early_leave_count,
    '인정결석', excused_absence_count,
    '무단결석', unexcused_absence_count,
    '보충불가', no_makeup_count,
    'total', late_count + early_leave_count + excused_absence_count + unexcused_absence_count + no_makeup_count
  )
  INTO _attendance_stats
  FROM exception_counts;

  -- 4. Top 5 students with most exceptions
  WITH student_exceptions AS (
    SELECT
      lr.student_id,
      s.name AS student_name,
      COUNT(*) FILTER (WHERE 
        '지각' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '조퇴' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '인정결석' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '무단결석' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '보충불가' = ANY(COALESCE(lr.attendance_status, '{}'))
      ) AS exception_count
    FROM public.lesson_records lr
    JOIN public.students s ON s.id = lr.student_id
    WHERE lr.lesson_date BETWEEN _start_date AND _end_date
      AND lr.submitted = true
      AND (_teacher_id IS NULL OR lr.teacher_id = _teacher_id)
      AND (_subject IS NULL OR lr.subject::text = _subject)
    GROUP BY lr.student_id, s.name
    HAVING COUNT(*) FILTER (WHERE 
      '지각' = ANY(COALESCE(lr.attendance_status, '{}')) OR
      '조퇴' = ANY(COALESCE(lr.attendance_status, '{}')) OR
      '인정결석' = ANY(COALESCE(lr.attendance_status, '{}')) OR
      '무단결석' = ANY(COALESCE(lr.attendance_status, '{}')) OR
      '보충불가' = ANY(COALESCE(lr.attendance_status, '{}'))
    ) > 0
    ORDER BY exception_count DESC
    LIMIT 5
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'student_id', student_id,
      'student_name', student_name,
      'exception_count', exception_count
    )
  ), '[]'::jsonb)
  INTO _top_exception_students
  FROM student_exceptions;

  -- 5. Teacher breakdown (exceptions per teacher)
  WITH teacher_exceptions AS (
    SELECT
      lr.teacher_id,
      COALESCE(p.full_name, p.email, '알 수 없음') AS teacher_name,
      COUNT(*) FILTER (WHERE 
        '지각' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '조퇴' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '인정결석' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '무단결석' = ANY(COALESCE(lr.attendance_status, '{}')) OR
        '보충불가' = ANY(COALESCE(lr.attendance_status, '{}'))
      ) AS exception_count,
      COUNT(*) AS total_lessons
    FROM public.lesson_records lr
    LEFT JOIN public.profiles p ON p.id = lr.teacher_id
    WHERE lr.lesson_date BETWEEN _start_date AND _end_date
      AND lr.submitted = true
      AND (_teacher_id IS NULL OR lr.teacher_id = _teacher_id)
      AND (_subject IS NULL OR lr.subject::text = _subject)
    GROUP BY lr.teacher_id, p.full_name, p.email
    ORDER BY teacher_name
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'teacher_id', teacher_id,
      'teacher_name', teacher_name,
      'exception_count', exception_count,
      'total_lessons', total_lessons
    )
  ), '[]'::jsonb)
  INTO _teacher_breakdown
  FROM teacher_exceptions;

  -- Build final result
  _result := jsonb_build_object(
    'lesson_stats', _lesson_stats,
    'homework_stats', _homework_stats,
    'attendance_stats', _attendance_stats,
    'top_exception_students', _top_exception_students,
    'teacher_breakdown', _teacher_breakdown
  );

  RETURN _result;
END;
$$;