-- A) Add followup_2w_done_subjects to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS followup_2w_done_subjects TEXT[] NOT NULL DEFAULT '{}';

-- B) Drop old RPC and recreate with new signature
DROP FUNCTION IF EXISTS public.get_prev_homework_status_for_roster(jsonb, date);

-- C) Recreate RPC with subject in pairs and new return fields
CREATE OR REPLACE FUNCTION public.get_prev_homework_status_for_roster(
  _pairs jsonb,
  _today date DEFAULT CURRENT_DATE
)
RETURNS TABLE(
  student_id uuid,
  class_id uuid,
  prev_lesson_date date,
  homework_status text,
  debug_reason text,
  subject text,
  first_subject boolean,
  first_subject_date date,
  followup_2w_due boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller_id uuid := auth.uid();
  _is_admin boolean;
  _is_teacher boolean;
  _is_assistant boolean;
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
      (p->>'student_id')::uuid AS student_id,
      (p->>'class_id')::uuid AS class_id,
      COALESCE(p->>'subject', '') AS subject
    FROM jsonb_array_elements(_pairs) AS p
  ),
  -- Get the first lesson date for each student+subject combination (submitted only)
  first_subject_lessons AS (
    SELECT 
      lr.student_id,
      lr.subject::text AS subject,
      MIN(lr.lesson_date) AS first_lesson_date
    FROM lesson_records lr
    WHERE lr.submitted = true
      AND EXISTS (SELECT 1 FROM pairs WHERE pairs.student_id = lr.student_id)
    GROUP BY lr.student_id, lr.subject
  ),
  -- Get followup done subjects for each student
  student_followup AS (
    SELECT 
      s.id AS student_id,
      COALESCE(s.followup_2w_done_subjects, '{}') AS done_subjects
    FROM students s
    WHERE EXISTS (SELECT 1 FROM pairs WHERE pairs.student_id = s.id)
  ),
  -- Access control: get accessible class_ids for the caller
  accessible_classes AS (
    SELECT c.id AS class_id
    FROM classes c
    WHERE _is_admin 
       OR _is_assistant
       OR (_is_teacher AND c.teacher_id = _caller_id)
  ),
  -- Determine accessible pairs
  accessible_pairs AS (
    SELECT pa.student_id, pa.class_id, pa.subject
    FROM pairs pa
    WHERE EXISTS (SELECT 1 FROM accessible_classes ac WHERE ac.class_id = pa.class_id)
  ),
  -- Previous lesson records (for homework status)
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
  all_pairs_with_status AS (
    SELECT 
      ap.student_id,
      ap.class_id,
      rl.lesson_date AS prev_lesson_date,
      rl.homework_status,
      CASE 
        WHEN rl.student_id IS NULL THEN 'no_prev_record'
        ELSE 'found'
      END AS debug_reason,
      ap.subject
    FROM accessible_pairs ap
    LEFT JOIN ranked_lessons rl 
      ON rl.student_id = ap.student_id 
      AND rl.class_id = ap.class_id 
      AND rl.rn = 1
  ),
  blocked_pairs AS (
    SELECT 
      pa.student_id,
      pa.class_id,
      NULL::date AS prev_lesson_date,
      NULL::text AS homework_status,
      'blocked_by_access' AS debug_reason,
      pa.subject
    FROM pairs pa
    WHERE NOT EXISTS (
      SELECT 1 FROM accessible_pairs ap 
      WHERE ap.student_id = pa.student_id AND ap.class_id = pa.class_id
    )
    AND _is_admin
  ),
  combined AS (
    SELECT * FROM all_pairs_with_status
    UNION ALL
    SELECT * FROM blocked_pairs
  )
  SELECT 
    c.student_id,
    c.class_id,
    c.prev_lesson_date,
    COALESCE(c.homework_status, '') AS homework_status,
    c.debug_reason,
    c.subject,
    -- first_subject: true if no previous submitted lesson for this student+subject before today
    CASE 
      WHEN fsl.first_lesson_date IS NULL THEN true
      WHEN fsl.first_lesson_date >= _today THEN true
      ELSE false
    END AS first_subject,
    fsl.first_lesson_date AS first_subject_date,
    -- followup_2w_due: true if first lesson was 14+ days ago AND subject not in done_subjects
    CASE
      WHEN fsl.first_lesson_date IS NULL THEN false
      WHEN _today >= fsl.first_lesson_date + INTERVAL '14 days' 
           AND NOT (c.subject = ANY(COALESCE(sf.done_subjects, '{}'))) THEN true
      ELSE false
    END AS followup_2w_due
  FROM combined c
  LEFT JOIN first_subject_lessons fsl ON fsl.student_id = c.student_id AND fsl.subject = c.subject
  LEFT JOIN student_followup sf ON sf.student_id = c.student_id;
END;
$$;