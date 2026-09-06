CREATE OR REPLACE FUNCTION public.get_admin_enrollment_stats(_grade_filter text DEFAULT NULL::text, _subject_filter text DEFAULT NULL::text, _teacher_id_filter uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller uuid := auth.uid();
  _totals jsonb;
  _by_subject jsonb;
  _by_grade jsonb;
  _by_teacher jsonb;
  _students jsonb;
BEGIN
  IF NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'Unauthorized: only admin can access enrollment stats';
  END IF;

  CREATE TEMP TABLE _assign ON COMMIT DROP AS
  WITH active_students AS (
    SELECT s.id, s.name, s.grade
    FROM students s
    WHERE s.status = 'normal'
      AND COALESCE(s.enrollment_status, '재원') NOT IN ('퇴원', '휴학')
  ),
  from_courses AS (
    SELECT sc.student_id, cp.subject::text AS subject, sc.teacher_id
    FROM student_courses sc
    JOIN course_policies cp ON cp.id = sc.course_policy_id
    JOIN active_students a ON a.id = sc.student_id
    LEFT JOIN profiles p ON p.id = sc.teacher_id
    WHERE sc.is_active
      AND (sc.teacher_id IS NULL OR p.is_active)
  ),
  from_mapping AS (
    SELECT sst.student_id, sst.subject, sst.teacher_id
    FROM student_subject_teachers sst
    JOIN active_students a ON a.id = sst.student_id
    JOIN profiles p ON p.id = sst.teacher_id AND p.is_active
  )
  SELECT DISTINCT student_id, subject, teacher_id
  FROM (SELECT * FROM from_courses UNION SELECT * FROM from_mapping) u;

  WITH base AS (
    SELECT s.id AS student_id, s.name AS student_name, s.grade,
      COUNT(DISTINCT a.subject) AS subject_count,
      ARRAY_AGG(DISTINCT a.subject) FILTER (WHERE a.subject IS NOT NULL) AS subjects,
      ARRAY_AGG(DISTINCT a.teacher_id) FILTER (WHERE a.teacher_id IS NOT NULL) AS teacher_ids
    FROM students s
    LEFT JOIN _assign a ON a.student_id = s.id
    WHERE s.status = 'normal'
      AND COALESCE(s.enrollment_status, '재원') NOT IN ('퇴원', '휴학')
    GROUP BY s.id, s.name, s.grade
  ),
  with_names AS (
    SELECT b.*, ARRAY(
      SELECT DISTINCT p.full_name FROM unnest(b.teacher_ids) tid
      JOIN profiles p ON p.id = tid ORDER BY p.full_name
    ) AS teacher_names
    FROM base b
  )
  SELECT jsonb_agg(jsonb_build_object(
    'student_id', w.student_id,
    'student_name', w.student_name,
    'grade', w.grade,
    'subject_count', w.subject_count,
    'subjects', COALESCE(w.subjects, ARRAY[]::text[]),
    'teacher_names', COALESCE(w.teacher_names, ARRAY[]::text[])
  ) ORDER BY w.student_name)
  INTO _students
  FROM with_names w
  WHERE (_grade_filter IS NULL OR w.grade = _grade_filter)
    AND (_subject_filter IS NULL OR _subject_filter = ANY(w.subjects))
    AND (_teacher_id_filter IS NULL OR _teacher_id_filter = ANY(w.teacher_ids));

  SELECT jsonb_build_object(
    'total_students', (SELECT COUNT(*) FROM students s WHERE s.status='normal' AND COALESCE(s.enrollment_status,'재원') NOT IN ('퇴원','휴학')),
    'students_with_classes', (SELECT COUNT(DISTINCT student_id) FROM _assign),
    'total_classes', (SELECT COUNT(*) FROM classes c JOIN profiles p ON p.id = c.teacher_id WHERE p.is_active),
    'total_teachers', (SELECT COUNT(DISTINCT teacher_id) FROM _assign WHERE teacher_id IS NOT NULL)
  ) INTO _totals;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('subject', subject, 'student_count', cnt) ORDER BY subject), '[]'::jsonb)
  INTO _by_subject
  FROM (SELECT subject, COUNT(DISTINCT student_id) cnt FROM _assign WHERE subject IS NOT NULL GROUP BY subject) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object('grade', COALESCE(grade,'미지정'), 'student_count', cnt) ORDER BY grade), '[]'::jsonb)
  INTO _by_grade
  FROM (
    SELECT s.grade, COUNT(*) cnt FROM students s
    WHERE s.status='normal' AND COALESCE(s.enrollment_status,'재원') NOT IN ('퇴원','휴학')
    GROUP BY s.grade
  ) t;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'teacher_id', teacher_id,
    'teacher_name', COALESCE(teacher_name,'미배정'),
    'student_count', student_count,
    'subjects', subjects
  ) ORDER BY teacher_name), '[]'::jsonb)
  INTO _by_teacher
  FROM (
    SELECT a.teacher_id, p.full_name AS teacher_name,
      COUNT(DISTINCT a.student_id) AS student_count,
      ARRAY_AGG(DISTINCT a.subject ORDER BY a.subject) AS subjects
    FROM _assign a
    LEFT JOIN profiles p ON p.id = a.teacher_id
    WHERE a.teacher_id IS NOT NULL
    GROUP BY a.teacher_id, p.full_name
  ) t;

  DROP TABLE IF EXISTS _assign;

  RETURN jsonb_build_object(
    'totals', _totals,
    'by_subject', _by_subject,
    'by_grade', _by_grade,
    'by_teacher', _by_teacher,
    'students', COALESCE(_students, '[]'::jsonb)
  );
END;
$function$;