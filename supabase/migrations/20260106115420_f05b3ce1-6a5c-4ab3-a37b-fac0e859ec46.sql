-- Create RPC function for creating assistant tasks with proper conflict handling
-- Uses ON CONFLICT ON CONSTRAINT to work with the partial unique index

CREATE OR REPLACE FUNCTION public.create_assistant_task(
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
  v_row public.assistant_tasks;
  v_caller_id uuid := auth.uid();
  v_caller_role text;
  v_is_new boolean := false;
BEGIN
  -- Check caller is authenticated
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: not logged in';
  END IF;
  
  -- Get caller's role
  SELECT role::text INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = v_caller_id
  ORDER BY (role = 'admin') DESC
  LIMIT 1;
  
  -- Default to 'teacher' if no role found
  v_caller_role := COALESCE(v_caller_role, 'teacher');

  -- Insert with conflict handling on the unique constraint
  INSERT INTO public.assistant_tasks (
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
  )
  VALUES (
    _title,
    COALESCE(NULLIF(_assignee, ''), '미배정'),
    _due_date,
    COALESCE(_notes, ''),
    'todo',
    'normal',
    CURRENT_DATE,
    'teacher_request',
    v_caller_id,
    v_caller_role,
    _related_teacher_id
  )
  ON CONFLICT ON CONSTRAINT idx_assistant_tasks_unique_template
  DO UPDATE SET
    updated_at = now()
  RETURNING * INTO v_row;
  
  -- Check if this was a new insert or an update (conflict)
  -- If created_at and updated_at are very close (within 1 second), it's new
  IF v_row.updated_at - v_row.created_at < interval '1 second' THEN
    v_is_new := true;
  END IF;

  RETURN jsonb_build_object(
    'id', v_row.id,
    'title', v_row.title,
    'assignee', v_row.assignee,
    'status', v_row.status,
    'due_date', v_row.due_date,
    'notes', v_row.notes,
    'created_at', v_row.created_at,
    'is_new', v_is_new
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.create_assistant_task(text, text, date, text, uuid) TO authenticated;