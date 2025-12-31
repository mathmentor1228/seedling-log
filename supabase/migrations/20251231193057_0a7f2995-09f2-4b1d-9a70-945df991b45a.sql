-- Drop and recreate get_prev_homework_status_for_roster with admin bypass and debug_reason
DROP FUNCTION IF EXISTS public.get_prev_homework_status_for_roster(jsonb, date);

CREATE OR REPLACE FUNCTION public.get_prev_homework_status_for_roster(_pairs jsonb, _today date DEFAULT CURRENT_DATE)
 RETURNS TABLE(student_id uuid, class_id uuid, homework_status text, prev_lesson_date date, debug_reason text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _caller_id UUID := auth.uid();
  _is_admin BOOLEAN;
  _is_teacher BOOLEAN;
  _is_assistant BOOLEAN;
BEGIN
  -- Check caller roles
  _is_admin := has_role(_caller_id, 'admin');
  _is_teacher := has_role(_caller_id, 'teacher');
  _is_assistant := has_role(_caller_id, 'assistant');
  
  -- Only allow admin, teacher, or assistant
  IF NOT (_is_admin OR _is_teacher OR _is_assistant) THEN
    RAISE EXCEPTION 'Unauthorized: only admin, teacher, or assistant can call this function';
  END IF;
  
  RETURN QUERY
  WITH pairs AS (
    SELECT 
      (p->>'student_id')::UUID AS student_id,
      (p->>'class_id')::UUID AS class_id
    FROM jsonb_array_elements(_pairs) AS p
  ),
  -- For admin, skip class ownership check
  accessible_pairs AS (
    SELECT 
      pa.student_id,
      pa.class_id
    FROM pairs pa
    WHERE 
      _is_admin 
      OR _is_assistant
      OR (
        _is_teacher AND EXISTS (
          SELECT 1 FROM classes c 
          WHERE c.id = pa.class_id AND c.teacher_id = _caller_id
        )
      )
  ),
  ranked_lessons AS (
    SELECT 
      lr.student_id,
      lr.class_id,
      lr.homework_status,
      lr.lesson_date,
      lr.created_at,
      ROW_NUMBER() OVER (
        PARTITION BY lr.student_id, lr.class_id 
        ORDER BY lr.lesson_date DESC, lr.created_at DESC
      ) AS rn
    FROM lesson_records lr
    INNER JOIN accessible_pairs ap 
      ON lr.student_id = ap.student_id AND lr.class_id = ap.class_id
    WHERE lr.lesson_date < _today
      AND lr.submitted = true
  ),
  -- All pairs with their status
  all_pairs_with_status AS (
    SELECT 
      ap.student_id,
      ap.class_id,
      rl.homework_status,
      rl.lesson_date AS prev_lesson_date,
      CASE 
        WHEN rl.student_id IS NULL THEN 'no_prev_record'
        ELSE 'found'
      END AS debug_reason
    FROM accessible_pairs ap
    LEFT JOIN ranked_lessons rl 
      ON rl.student_id = ap.student_id 
      AND rl.class_id = ap.class_id 
      AND rl.rn = 1
  ),
  -- For admin, also show blocked pairs
  blocked_pairs AS (
    SELECT 
      pa.student_id,
      pa.class_id,
      NULL::text AS homework_status,
      NULL::date AS prev_lesson_date,
      'blocked_by_access' AS debug_reason
    FROM pairs pa
    WHERE NOT EXISTS (
      SELECT 1 FROM accessible_pairs ap 
      WHERE ap.student_id = pa.student_id AND ap.class_id = pa.class_id
    )
    AND _is_admin -- Only show blocked info to admin
  )
  -- Return all accessible pairs with status
  SELECT * FROM all_pairs_with_status
  UNION ALL
  SELECT * FROM blocked_pairs;
END;
$function$;