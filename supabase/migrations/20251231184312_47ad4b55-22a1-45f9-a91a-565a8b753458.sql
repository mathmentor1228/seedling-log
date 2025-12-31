-- Create RPC function to get previous homework status for roster students
-- This avoids RLS issues by using SECURITY DEFINER with proper access control

CREATE OR REPLACE FUNCTION public.get_prev_homework_status_for_roster(
  _pairs JSONB,
  _today DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  student_id UUID,
  class_id UUID,
  homework_status TEXT,
  prev_lesson_date DATE
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- For teachers, verify they have access to the classes
  -- For assistants, they can view all classes (RLS policy allows this)
  -- For admins, allow all classes
  
  RETURN QUERY
  WITH pairs AS (
    SELECT 
      (p->>'student_id')::UUID AS student_id,
      (p->>'class_id')::UUID AS class_id
    FROM jsonb_array_elements(_pairs) AS p
  ),
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
  )
  SELECT 
    rl.student_id,
    rl.class_id,
    rl.homework_status,
    rl.lesson_date
  FROM ranked_lessons rl
  WHERE rl.rn = 1;
END;
$$;