-- ASSISTANT-REQUEST-DEDUP-CONSTRAINT-V3
-- The unique index uses COALESCE expressions which cannot be a CONSTRAINT.
-- Solution: Use manual duplicate check in RPC function.

-- Drop existing RPC function if exists
DROP FUNCTION IF EXISTS public.create_assistant_task(text, text, date, text, uuid);

-- Create RPC function with manual dedup check
CREATE OR REPLACE FUNCTION public.create_assistant_task(
  _title text,
  _assignee text,
  _due_date date,
  _notes text,
  _related_teacher_id uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row assistant_tasks;
  v_existing_id uuid;
  v_task_type text;
BEGIN
  -- Determine task_type from title
  v_task_type := CASE
    WHEN _title ILIKE '%테스트%' THEN '시험 관리'
    WHEN _title ILIKE '%시험%' THEN '시험 관리'
    WHEN _title ILIKE '%결석%' OR _title ILIKE '%병결%' OR _title ILIKE '%조퇴%' THEN '출결 처리'
    WHEN _title ILIKE '%연락%' OR _title ILIKE '%알림%' THEN '학부모 연락'
    ELSE '기타'
  END;

  -- Check for existing duplicate using same logic as the unique index
  SELECT id INTO v_existing_id
  FROM assistant_tasks
  WHERE task_date = CURRENT_DATE
    AND task_type = v_task_type
    AND COALESCE(related_student_id, '00000000-0000-0000-0000-000000000000'::uuid) = '00000000-0000-0000-0000-000000000000'::uuid
    AND COALESCE(related_teacher_id, '00000000-0000-0000-0000-000000000000'::uuid) = COALESCE(_related_teacher_id, '00000000-0000-0000-0000-000000000000'::uuid)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Return existing row
    SELECT * INTO v_row FROM assistant_tasks WHERE id = v_existing_id;
    RETURN jsonb_build_object('task', row_to_json(v_row)::jsonb, 'is_new', false);
  END IF;

  -- Insert new row
  INSERT INTO assistant_tasks (
    title,
    assignee,
    due_date,
    notes,
    status,
    priority,
    task_date,
    task_type,
    created_by,
    created_by_role,
    related_teacher_id
  ) VALUES (
    _title,
    COALESCE(NULLIF(_assignee, ''), '미배정'),
    _due_date,
    COALESCE(_notes, ''),
    'todo',
    'normal',
    CURRENT_DATE,
    v_task_type,
    auth.uid(),
    COALESCE((SELECT role::text FROM user_roles WHERE user_id = auth.uid() ORDER BY role = 'admin' DESC LIMIT 1), 'teacher'),
    _related_teacher_id
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('task', row_to_json(v_row)::jsonb, 'is_new', true);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_assistant_task(text, text, date, text, uuid) TO authenticated;