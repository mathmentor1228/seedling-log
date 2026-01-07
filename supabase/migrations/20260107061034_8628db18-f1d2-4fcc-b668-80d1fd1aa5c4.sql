
-- ASSISTANT-REQUEST-MULTI-CREATE-V1
-- Drop and recreate RPC to always insert (no dedup)
DROP FUNCTION IF EXISTS public.create_assistant_task(text, text, date, text, uuid);

CREATE FUNCTION public.create_assistant_task(
  _title text,
  _assignee text,
  _due_date date,
  _notes text,
  _related_teacher_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row assistant_tasks;
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

  -- Always insert new row (no dedup) - ASSISTANT-REQUEST-MULTI-CREATE-V1
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
