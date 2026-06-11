
-- 1) Allow '최수린조교' in assistant_tasks.assignee
ALTER TABLE public.assistant_tasks DROP CONSTRAINT IF EXISTS assistant_tasks_assignee_check;
ALTER TABLE public.assistant_tasks ADD CONSTRAINT assistant_tasks_assignee_check
  CHECK (assignee = ANY (ARRAY['유빈조교'::text, '은서조교'::text, '다인조교'::text, '최수린조교'::text, '미배정'::text]));

-- 2) Allow '최수린조교' in lesson_records.test_assistant CHECKs (drop any old constraints)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.lesson_records'::regclass
      AND pg_get_constraintdef(oid) ILIKE '%test_assistant%'
  LOOP
    EXECUTE format('ALTER TABLE public.lesson_records DROP CONSTRAINT %I', r.conname);
  END LOOP;
END $$;

ALTER TABLE public.lesson_records ADD CONSTRAINT lesson_records_test_assistant_check
  CHECK (test_assistant IS NULL OR test_assistant IN ('은서조교','유빈조교','다인조교','최수린조교'));
ALTER TABLE public.lesson_records ADD CONSTRAINT lesson_records_test_assistant_2_check
  CHECK (test_assistant_2 IS NULL OR test_assistant_2 IN ('은서조교','유빈조교','다인조교','최수린조교'));

-- 3) Update update_lesson_test_fields validator
CREATE OR REPLACE FUNCTION public.update_lesson_test_fields(_lesson_id uuid, _test_name text DEFAULT NULL, _test_content text DEFAULT NULL, _test_result_text text DEFAULT NULL, _test_result text DEFAULT 'none', _test_notes text DEFAULT NULL, _test_date date DEFAULT NULL, _test_time time without time zone DEFAULT NULL, _test_assistant text DEFAULT NULL, _test_slot integer DEFAULT 1)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (has_role(auth.uid(),'assistant') OR has_role(auth.uid(),'admin') OR has_role(auth.uid(),'teacher')) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;
  IF _test_result NOT IN ('pass','fail','none') THEN RAISE EXCEPTION 'Invalid test_result'; END IF;
  IF _test_assistant IS NOT NULL AND _test_assistant NOT IN ('은서조교','유빈조교','다인조교','최수린조교') THEN
    RAISE EXCEPTION 'Invalid test_assistant value';
  END IF;
  IF _test_slot = 2 THEN
    UPDATE public.lesson_records SET
      test_name_2 = COALESCE(_test_name, test_name_2),
      test_content_2 = COALESCE(_test_content, test_content_2),
      test_result_text_2 = COALESCE(_test_result_text, test_result_text_2),
      test_result_2 = _test_result,
      test_date_2 = COALESCE(_test_date, test_date_2),
      test_assistant_2 = _test_assistant,
      english_pass_fail_2 = CASE WHEN _test_result='pass' THEN 'pass' WHEN _test_result='fail' THEN 'fail' ELSE NULL END,
      updated_at = now()
    WHERE id = _lesson_id;
  ELSE
    UPDATE public.lesson_records SET
      test_name = COALESCE(_test_name, test_name),
      test_content = COALESCE(_test_content, test_content),
      test_result_text = COALESCE(_test_result_text, test_result_text),
      test_result = _test_result,
      test_notes = COALESCE(_test_notes, test_notes),
      test_date = COALESCE(_test_date, test_date),
      test_time = _test_time,
      test_assistant = _test_assistant,
      updated_at = now()
    WHERE id = _lesson_id;
  END IF;
  RETURN FOUND;
END;
$function$;

-- 4) Private messages (1:1 between teacher and assistant)
CREATE TABLE public.private_messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT,
  link_url TEXT,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','done')),
  done_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.private_messages TO authenticated;
GRANT ALL ON public.private_messages TO service_role;
ALTER TABLE public.private_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "participants can view"
  ON public.private_messages FOR SELECT TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "sender can insert"
  ON public.private_messages FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = from_user_id);
CREATE POLICY "participants can update"
  ON public.private_messages FOR UPDATE TO authenticated
  USING (auth.uid() = from_user_id OR auth.uid() = to_user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "sender or admin can delete"
  ON public.private_messages FOR DELETE TO authenticated
  USING (auth.uid() = from_user_id OR has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_private_messages_updated
BEFORE UPDATE ON public.private_messages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_private_messages_pair ON public.private_messages (from_user_id, to_user_id, created_at DESC);
CREATE INDEX idx_private_messages_to ON public.private_messages (to_user_id, created_at DESC);

-- 5) Assistant work logs (clock in/out)
CREATE TABLE public.assistant_work_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assistant_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clock_in_at TIMESTAMPTZ NOT NULL,
  clock_out_at TIMESTAMPTZ,
  total_minutes INT GENERATED ALWAYS AS (
    CASE WHEN clock_out_at IS NOT NULL
      THEN GREATEST(0, (EXTRACT(EPOCH FROM (clock_out_at - clock_in_at))/60)::INT)
      ELSE NULL END
  ) STORED,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_work_logs TO authenticated;
GRANT ALL ON public.assistant_work_logs TO service_role;
ALTER TABLE public.assistant_work_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "self or admin view"
  ON public.assistant_work_logs FOR SELECT TO authenticated
  USING (auth.uid() = assistant_user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "self insert"
  ON public.assistant_work_logs FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = assistant_user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "self or admin update"
  ON public.assistant_work_logs FOR UPDATE TO authenticated
  USING (auth.uid() = assistant_user_id OR has_role(auth.uid(),'admin'));
CREATE POLICY "self or admin delete"
  ON public.assistant_work_logs FOR DELETE TO authenticated
  USING (auth.uid() = assistant_user_id OR has_role(auth.uid(),'admin'));

CREATE TRIGGER trg_assistant_work_logs_updated
BEFORE UPDATE ON public.assistant_work_logs
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_work_logs_user_date ON public.assistant_work_logs (assistant_user_id, clock_in_at DESC);
