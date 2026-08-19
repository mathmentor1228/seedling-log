CREATE OR REPLACE FUNCTION public.reconcile_lesson_homework(
  _lesson_record_id uuid,
  _student_id uuid,
  _subject subject_type,
  _assigned_date date,
  _items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _is_admin boolean;
  _is_staff boolean;
  _kept_ids uuid[];
  _protected_count int := 0;
  _updated int := 0;
  _inserted int := 0;
  _deleted int := 0;
  _item jsonb;
  _bad int;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  IF _lesson_record_id IS NULL OR _student_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_ARGS';
  END IF;

  _is_admin := public.has_role(_uid, 'admin');
  _is_staff := _is_admin OR public.has_role(_uid, 'teacher') OR public.has_role(_uid, 'assistant');
  IF NOT _is_staff THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT _is_admin AND NOT public.teacher_owns_student(_uid, _student_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_STUDENT';
  END IF;

  -- lesson record must belong to the given student
  IF NOT EXISTS (
    SELECT 1 FROM public.lesson_records lr
    WHERE lr.id = _lesson_record_id AND lr.student_id = _student_id
  ) THEN
    RAISE EXCEPTION 'RECORD_STUDENT_MISMATCH';
  END IF;

  _kept_ids := ARRAY(
    SELECT (elem->>'id')::uuid
    FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb)) elem
    WHERE nullif(elem->>'id','') IS NOT NULL
  );

  -- provided ids must belong to this record AND this student
  SELECT count(*) INTO _bad
  FROM unnest(_kept_ids) k
  WHERE NOT EXISTS (
    SELECT 1 FROM public.homework_assignments h
    WHERE h.id = k AND h.lesson_record_id = _lesson_record_id AND h.student_id = _student_id
  );
  IF _bad > 0 THEN
    RAISE EXCEPTION 'ITEM_SCOPE_MISMATCH';
  END IF;

  -- removed rows that carry submission/check history are protected
  SELECT count(*) INTO _protected_count
  FROM public.homework_assignments h
  WHERE h.lesson_record_id = _lesson_record_id
    AND NOT (h.id = ANY (_kept_ids))
    AND (
      h.submitted_at IS NOT NULL
      OR h.checked_at IS NOT NULL
      OR h.check_status <> 'unchecked'
      OR EXISTS (SELECT 1 FROM public.homework_submissions s WHERE s.homework_id = h.id)
    );
  IF _protected_count > 0 THEN
    RAISE EXCEPTION 'PROTECTED_HOMEWORK_DELETE_BLOCKED';
  END IF;

  -- update kept rows: assignment info only
  FOR _item IN SELECT * FROM jsonb_array_elements(coalesce(_items, '[]'::jsonb))
  LOOP
    IF nullif(_item->>'id','') IS NOT NULL THEN
      UPDATE public.homework_assignments
         SET content = _item->>'content',
             homework_type = coalesce(nullif(_item->>'homework_type',''), homework_type),
             assigned_date = _assigned_date,
             lesson_record_id = _lesson_record_id,
             subject = _subject
       WHERE id = (_item->>'id')::uuid;
      _updated := _updated + 1;
    ELSE
      INSERT INTO public.homework_assignments
        (student_id, subject, lesson_record_id, assigned_date, content, homework_type, created_by)
      VALUES
        (_student_id, _subject, _lesson_record_id, _assigned_date, _item->>'content',
         coalesce(nullif(_item->>'homework_type',''), 'regular'), _uid);
      _inserted := _inserted + 1;
    END IF;
  END LOOP;

  -- delete only history-free removed rows
  WITH del AS (
    DELETE FROM public.homework_assignments h
    WHERE h.lesson_record_id = _lesson_record_id
      AND NOT (h.id = ANY (_kept_ids))
      AND h.submitted_at IS NULL
      AND h.checked_at IS NULL
      AND h.check_status = 'unchecked'
      AND NOT EXISTS (SELECT 1 FROM public.homework_submissions s WHERE s.homework_id = h.id)
    RETURNING 1
  )
  SELECT count(*) INTO _deleted FROM del;

  RETURN jsonb_build_object('updated', _updated, 'inserted', _inserted, 'deleted', _deleted);
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_lesson_homework(uuid, uuid, subject_type, date, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_lesson_homework(uuid, uuid, subject_type, date, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.reconcile_lesson_homework(uuid, uuid, subject_type, date, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_lesson_homework(uuid, uuid, subject_type, date, jsonb) TO service_role;