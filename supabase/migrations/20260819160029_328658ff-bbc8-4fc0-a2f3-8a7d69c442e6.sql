ALTER TABLE public.homework_link_repair_log
  ADD COLUMN IF NOT EXISTS reverted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reverted_at timestamptz,
  ADD COLUMN IF NOT EXISTS revert_reason text;

DO $$
DECLARE v_cnt int; v_upd int;
BEGIN
  CREATE TEMP TABLE tgt ON COMMIT DROP AS
  WITH batch AS (
    SELECT homework_id, new_lesson_record_id
    FROM public.homework_link_repair_log
    WHERE reason = 'P0 regular-unlinked safe relink batch 2026-08-20' AND reverted = false
  ),
  grp AS (
    SELECT a.lesson_record_id, btrim(a.content) c
    FROM public.homework_assignments a
    WHERE a.lesson_record_id IN (SELECT new_lesson_record_id FROM batch)
    GROUP BY 1,2
    HAVING count(*) > 1
       AND count(*) FILTER (WHERE a.id IN (SELECT homework_id FROM batch)) > 1
  ),
  ranked AS (
    SELECT a.id, row_number() OVER (PARTITION BY a.lesson_record_id, btrim(a.content)
                                    ORDER BY a.created_at ASC, a.id ASC) rn
    FROM public.homework_assignments a
    JOIN grp g ON g.lesson_record_id = a.lesson_record_id AND g.c = btrim(a.content)
    WHERE a.id IN (SELECT homework_id FROM batch)
  )
  SELECT id FROM ranked WHERE rn > 1;

  SELECT count(*) INTO v_cnt FROM tgt;
  IF v_cnt <> 1 THEN
    RAISE EXCEPTION 'ABORT: revert target count is % (expected 1)', v_cnt;
  END IF;

  UPDATE public.homework_assignments a
  SET lesson_record_id = l.previous_lesson_record_id
  FROM public.homework_link_repair_log l
  WHERE a.id = l.homework_id
    AND l.reason = 'P0 regular-unlinked safe relink batch 2026-08-20'
    AND a.id IN (SELECT id FROM tgt)
    AND a.lesson_record_id = l.new_lesson_record_id;
  GET DIAGNOSTICS v_upd = ROW_COUNT;
  IF v_upd <> 1 THEN RAISE EXCEPTION 'ABORT: reverted % rows <> 1', v_upd; END IF;

  UPDATE public.homework_link_repair_log l
  SET reverted = true, reverted_at = now(),
      revert_reason = 'duplicate content guard: kept earliest created_at row linked'
  WHERE l.homework_id IN (SELECT id FROM tgt)
    AND l.reason = 'P0 regular-unlinked safe relink batch 2026-08-20';
END $$;