-- ADMIN-STATS-PAGE-V1: Create RPC function for enrollment statistics
-- Returns student enrollment stats by subject, grade, and teacher

CREATE OR REPLACE FUNCTION public.get_admin_enrollment_stats(
  _grade_filter text DEFAULT NULL,
  _subject_filter text DEFAULT NULL,
  _teacher_id_filter uuid DEFAULT NULL
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
  _totals jsonb;
  _by_subject jsonb;
  _by_grade jsonb;
  _by_teacher jsonb;
  _students jsonb;
BEGIN
  -- Only admin can access this function
  IF NOT _is_admin THEN
    RAISE EXCEPTION 'Unauthorized: only admin can access enrollment stats';
  END IF;

  -- 1. Build student details with subject counts
  WITH student_classes AS (
    SELECT 
      cs.student_id,
      c.subject::text AS subject,
      c.teacher_id
    FROM class_students cs
    JOIN classes c ON c.id = cs.class_id
  ),
  student_stats AS (
    SELECT 
      s.id AS student_id,
      s.name AS student_name,
      s.grade,
      COUNT(DISTINCT sc.subject) AS subject_count,
      ARRAY_AGG(DISTINCT sc.subject ORDER BY sc.subject) FILTER (WHERE sc.subject IS NOT NULL) AS subjects,
      ARRAY_AGG(DISTINCT sc.teacher_id) FILTER (WHERE sc.teacher_id IS NOT NULL) AS teacher_ids
    FROM students s
    LEFT JOIN student_classes sc ON sc.student_id = s.id
    WHERE s.status = 'normal'
    GROUP BY s.id, s.name, s.grade
  ),
  student_with_teachers AS (
    SELECT 
      ss.*,
      ARRAY(
        SELECT DISTINCT p.full_name 
        FROM unnest(ss.teacher_ids) tid
        JOIN profiles p ON p.id = tid
        ORDER BY p.full_name
      ) AS teacher_names
    FROM student_stats ss
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'student_id', swt.student_id,
      'student_name', swt.student_name,
      'grade', swt.grade,
      'subject_count', swt.subject_count,
      'subjects', COALESCE(swt.subjects, ARRAY[]::text[]),
      'teacher_names', COALESCE(swt.teacher_names, ARRAY[]::text[])
    ) ORDER BY swt.student_name
  )
  INTO _students
  FROM student_with_teachers swt
  WHERE (_grade_filter IS NULL OR swt.grade = _grade_filter)
    AND (_subject_filter IS NULL OR _subject_filter = ANY(swt.subjects))
    AND (_teacher_id_filter IS NULL OR _teacher_id_filter = ANY(swt.teacher_ids));

  -- 2. Totals
  SELECT jsonb_build_object(
    'total_students', (SELECT COUNT(*) FROM students WHERE status = 'normal'),
    'students_with_classes', (
      SELECT COUNT(DISTINCT cs.student_id) 
      FROM class_students cs 
      JOIN students s ON s.id = cs.student_id 
      WHERE s.status = 'normal'
    ),
    'total_classes', (SELECT COUNT(*) FROM classes),
    'total_teachers', (SELECT COUNT(DISTINCT teacher_id) FROM classes WHERE teacher_id IS NOT NULL)
  )
  INTO _totals;

  -- 3. By Subject
  WITH subject_counts AS (
    SELECT 
      c.subject::text AS subject,
      COUNT(DISTINCT cs.student_id) AS student_count
    FROM classes c
    JOIN class_students cs ON cs.class_id = c.id
    JOIN students s ON s.id = cs.student_id AND s.status = 'normal'
    GROUP BY c.subject
    ORDER BY c.subject
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'subject', subject,
      'student_count', student_count
    )
  ), '[]'::jsonb)
  INTO _by_subject
  FROM subject_counts;

  -- 4. By Grade
  WITH grade_counts AS (
    SELECT 
      s.grade,
      COUNT(*) AS student_count
    FROM students s
    WHERE s.status = 'normal'
    GROUP BY s.grade
    ORDER BY s.grade
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'grade', COALESCE(grade, '미지정'),
      'student_count', student_count
    )
  ), '[]'::jsonb)
  INTO _by_grade
  FROM grade_counts;

  -- 5. By Teacher
  WITH teacher_counts AS (
    SELECT 
      c.teacher_id,
      p.full_name AS teacher_name,
      COUNT(DISTINCT cs.student_id) AS student_count,
      ARRAY_AGG(DISTINCT c.subject::text ORDER BY c.subject::text) AS subjects
    FROM classes c
    JOIN class_students cs ON cs.class_id = c.id
    JOIN students s ON s.id = cs.student_id AND s.status = 'normal'
    LEFT JOIN profiles p ON p.id = c.teacher_id
    WHERE c.teacher_id IS NOT NULL
    GROUP BY c.teacher_id, p.full_name
    ORDER BY p.full_name
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'teacher_id', teacher_id,
      'teacher_name', COALESCE(teacher_name, '미배정'),
      'student_count', student_count,
      'subjects', subjects
    )
  ), '[]'::jsonb)
  INTO _by_teacher
  FROM teacher_counts;

  -- Build final result
  _result := jsonb_build_object(
    'totals', _totals,
    'by_subject', _by_subject,
    'by_grade', _by_grade,
    'by_teacher', _by_teacher,
    'students', COALESCE(_students, '[]'::jsonb)
  );

  RETURN _result;
END;
$$;