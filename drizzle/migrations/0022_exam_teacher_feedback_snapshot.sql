ALTER TABLE public.exam_student_analyses ADD COLUMN feedback_items jsonb;
COMMENT ON COLUMN public.exam_student_analyses.feedback_items IS 'Teacher-selected wrong questions and reasons; separate snapshot preserves student self-review.';
CREATE OR REPLACE FUNCTION public.guard_exam_student_analysis_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.feedback_method IS NOT NULL AND NEW.status IN ('teacher_confirmed', 'published') THEN
    IF NEW.feedback_method = 'comment' AND (NEW.final_text IS NULL OR length(btrim(NEW.final_text)) < 20) THEN RAISE EXCEPTION 'FINAL_TEXT_REQUIRED'; END IF;
    IF NEW.feedback_method = 'items' THEN
      IF NEW.feedback_items IS NULL OR jsonb_typeof(NEW.feedback_items) <> 'array' THEN RAISE EXCEPTION 'ITEM_REASON_REQUIRED'; END IF;
      IF EXISTS (SELECT 1 FROM jsonb_array_elements(NEW.feedback_items) i WHERE jsonb_typeof(i->'reason_tags') IS DISTINCT FROM 'array' OR NOT (i->>'item_number' ~ '^([1-9]|[1-5][0-9]|60)$') OR (coalesce(jsonb_array_length(i->'reason_tags'), 0) = 0 AND coalesce(length(btrim(i->>'memo')), 0) = 0)) THEN RAISE EXCEPTION 'ITEM_REASON_REQUIRED'; END IF;
      NEW.wrong_count := jsonb_array_length(NEW.feedback_items);
    END IF;
  END IF;
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN RAISE EXCEPTION 'PRINCIPAL_ONLY_PUBLISH'; END IF;
    IF NEW.feedback_method IS NULL THEN
      IF NEW.academy_action_text IS NULL OR length(btrim(NEW.academy_action_text)) < 5 THEN RAISE EXCEPTION 'ACADEMY_ACTION_REQUIRED'; END IF;
      IF NEW.final_text IS NULL OR length(btrim(NEW.final_text)) < 20 THEN RAISE EXCEPTION 'FINAL_TEXT_REQUIRED'; END IF;
    END IF;
    NEW.principal_confirmed_by := COALESCE(NEW.principal_confirmed_by, auth.uid());
    NEW.principal_confirmed_at := COALESCE(NEW.principal_confirmed_at, now());
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END; $$;