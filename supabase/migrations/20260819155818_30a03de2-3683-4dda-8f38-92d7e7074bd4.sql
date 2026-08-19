CREATE TABLE IF NOT EXISTS public.homework_link_repair_log (
  id uuid primary key default gen_random_uuid(),
  homework_id uuid not null,
  previous_lesson_record_id uuid,
  new_lesson_record_id uuid not null,
  repaired_at timestamptz not null default now(),
  repaired_by uuid,
  reason text not null
);
GRANT SELECT ON public.homework_link_repair_log TO authenticated;
GRANT ALL ON public.homework_link_repair_log TO service_role;
ALTER TABLE public.homework_link_repair_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admins can view repair log" ON public.homework_link_repair_log;
CREATE POLICY "Admins can view repair log" ON public.homework_link_repair_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

DO $$
DECLARE v_cnt int; v_upd int; v_log int; v_before text; v_after text;
BEGIN
  CREATE TEMP TABLE cand ON COMMIT DROP AS
  SELECT a.id AS homework_id, lr.id AS lesson_record_id
  FROM public.homework_assignments a
  JOIN public.lesson_records lr
    ON lr.student_id = a.student_id AND lr.subject = a.subject AND lr.lesson_date = a.assigned_date
  WHERE a.lesson_record_id IS NULL
    AND a.homework_type = 'regular'
    AND lr.submitted = true
    AND (SELECT count(*) FROM public.lesson_records l2
         WHERE l2.student_id = a.student_id AND l2.subject = a.subject AND l2.lesson_date = a.assigned_date) = 1
    AND NOT EXISTS (
      SELECT 1 FROM public.homework_assignments h2
      WHERE h2.lesson_record_id = lr.id AND btrim(h2.content) = btrim(a.content));

  SELECT count(*) INTO v_cnt FROM cand;
  IF v_cnt <> 78 THEN
    RAISE EXCEPTION 'ABORT: candidate count is % (expected 78), no changes applied', v_cnt;
  END IF;

  SELECT md5(string_agg(x, '|' ORDER BY x)) INTO v_before
  FROM (SELECT a.id::text||coalesce(a.content,'')||coalesce(a.check_status,'')||coalesce(a.result,'')
               ||coalesce(a.notes,'')||coalesce(a.submitted_at::text,'')||coalesce(a.checked_at::text,'')
               ||coalesce(a.checked_by::text,'')||coalesce(a.points_earned::text,'')
               ||coalesce(a.created_at::text,'')||coalesce(a.created_by::text,'')
               ||a.assigned_date::text||a.homework_type AS x
        FROM public.homework_assignments a JOIN cand c ON c.homework_id = a.id) s;

  INSERT INTO public.homework_link_repair_log (homework_id, previous_lesson_record_id, new_lesson_record_id, repaired_by, reason)
  SELECT homework_id, NULL, lesson_record_id, NULL, 'P0 regular-unlinked safe relink batch 2026-08-20'
  FROM cand;
  GET DIAGNOSTICS v_log = ROW_COUNT;
  IF v_log <> 78 THEN RAISE EXCEPTION 'ABORT: log rows % <> 78', v_log; END IF;

  UPDATE public.homework_assignments a
  SET lesson_record_id = c.lesson_record_id
  FROM cand c
  WHERE a.id = c.homework_id AND a.lesson_record_id IS NULL;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> 78 THEN RAISE EXCEPTION 'ABORT: updated % rows <> 78, rolling back', v_upd; END IF;

  SELECT md5(string_agg(x, '|' ORDER BY x)) INTO v_after
  FROM (SELECT a.id::text||coalesce(a.content,'')||coalesce(a.check_status,'')||coalesce(a.result,'')
               ||coalesce(a.notes,'')||coalesce(a.submitted_at::text,'')||coalesce(a.checked_at::text,'')
               ||coalesce(a.checked_by::text,'')||coalesce(a.points_earned::text,'')
               ||coalesce(a.created_at::text,'')||coalesce(a.created_by::text,'')
               ||a.assigned_date::text||a.homework_type AS x
        FROM public.homework_assignments a JOIN cand c ON c.homework_id = a.id) s;
  IF v_before IS DISTINCT FROM v_after THEN
    RAISE EXCEPTION 'ABORT: protected columns changed, rolling back';
  END IF;
END $$;