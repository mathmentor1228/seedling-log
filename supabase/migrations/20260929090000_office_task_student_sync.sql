-- OFFICE-TASK-STUDENT-SYNC-V1 (2026-09-29)
-- 행정 업무 보드(admin_office_tasks)에 등록한 퇴원·휴원·재등원 안내가
-- 학생 기록(students.enrollment_status)에 자동 반영되도록 한다.
--
-- 흐름
--   1) 업무 등록 시 학생(student_id)과 적용일(effective_date)을 함께 저장
--   2) 적용일이 오늘(KST) 이하면 즉시 students.enrollment_status 변경
--      - '퇴원생 안내' → '퇴원' (withdrawn_at = 적용일 정오 KST)
--      - '휴원 안내'   → '휴학'
--      - '재등원 안내' → '재등원'
--      기존 트리거가 이어서 동작한다:
--        · trg_sync_student_withdrawn_at (withdrawn_at 보정/초기화)
--        · trg_cleanup_schedules_on_withdrawal (퇴원·휴학 시 반·시간표·강의실 배정 정리)
--   3) 적용일이 미래면 'scheduled'로 두고, 매일 05:10 KST pg_cron 또는
--      보드 진입 시 RPC(apply_due_office_task_student_sync)가 기한 도래분을 반영
--   4) 반영 결과는 업무 행(student_sync_*)과 댓글(작성자 '시스템')로 남긴다

ALTER TABLE public.admin_office_tasks
  ADD COLUMN IF NOT EXISTS student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS effective_date DATE,
  ADD COLUMN IF NOT EXISTS student_sync_status TEXT,
  ADD COLUMN IF NOT EXISTS student_sync_note TEXT,
  ADD COLUMN IF NOT EXISTS student_synced_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'admin_office_tasks_student_sync_status_check'
  ) THEN
    ALTER TABLE public.admin_office_tasks
      ADD CONSTRAINT admin_office_tasks_student_sync_status_check
      CHECK (student_sync_status IS NULL
             OR student_sync_status IN ('scheduled', 'applied', 'no_change', 'skipped'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_admin_office_tasks_student
  ON public.admin_office_tasks(student_id) WHERE student_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_admin_office_tasks_sync_scheduled
  ON public.admin_office_tasks(effective_date) WHERE student_sync_status = 'scheduled';

COMMENT ON COLUMN public.admin_office_tasks.student_id IS '업무와 연결된 학생. 퇴원·휴원·재등원 안내는 이 학생의 재원상태를 자동 변경한다.';
COMMENT ON COLUMN public.admin_office_tasks.effective_date IS '재원상태 변경 적용일(KST). NULL이면 등록 즉시.';
COMMENT ON COLUMN public.admin_office_tasks.student_sync_status IS 'scheduled=적용 대기, applied=반영됨, no_change=이미 같은 상태, skipped=학생 없음';

-- 분류 → 목표 재원상태
CREATE OR REPLACE FUNCTION public.office_task_target_status(_category TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE _category
    WHEN '퇴원생 안내' THEN '퇴원'
    WHEN '휴원 안내'   THEN '휴학'
    WHEN '재등원 안내' THEN '재등원'
    ELSE NULL
  END
$$;

-- 업무 1건을 학생 기록에 반영. 반환: applied / scheduled / no_change / skipped / not_applicable / missing
CREATE OR REPLACE FUNCTION public.apply_office_task_student_sync(_task_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  t RECORD;
  s RECORD;
  target TEXT;
  today_kst DATE := (now() AT TIME ZONE 'Asia/Seoul')::date;
  apply_date DATE;
  note TEXT;
BEGIN
  SELECT * INTO t FROM public.admin_office_tasks WHERE id = _task_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'missing';
  END IF;

  target := public.office_task_target_status(t.category);

  -- 학생 연결이 없거나 상태 변경 분류가 아니면 동기화 대상이 아니다
  IF target IS NULL OR t.student_id IS NULL THEN
    IF t.student_sync_status IS NOT NULL THEN
      UPDATE public.admin_office_tasks
      SET student_sync_status = NULL, student_sync_note = NULL
      WHERE id = t.id;
    END IF;
    RETURN 'not_applicable';
  END IF;

  -- 이미 반영된 업무는 다시 건드리지 않는다 (재원상태를 사람이 이후에 바꿨을 수 있음)
  IF t.student_sync_status = 'applied' THEN
    RETURN 'applied';
  END IF;

  apply_date := COALESCE(t.effective_date, today_kst);

  IF apply_date > today_kst THEN
    UPDATE public.admin_office_tasks
    SET student_sync_status = 'scheduled',
        student_sync_note = format('%s에 재원상태를 ''%s''(으)로 변경 예정', to_char(apply_date, 'YYYY-MM-DD'), target)
    WHERE id = t.id;
    RETURN 'scheduled';
  END IF;

  SELECT id, name, enrollment_status INTO s
  FROM public.students WHERE id = t.student_id FOR UPDATE;
  IF NOT FOUND THEN
    UPDATE public.admin_office_tasks
    SET student_sync_status = 'skipped', student_sync_note = '연결된 학생 기록을 찾을 수 없음', student_synced_at = now()
    WHERE id = t.id;
    RETURN 'skipped';
  END IF;

  IF s.enrollment_status = target THEN
    UPDATE public.admin_office_tasks
    SET student_sync_status = 'no_change',
        student_sync_note = format('%s 학생은 이미 ''%s'' 상태', s.name, target),
        student_synced_at = now()
    WHERE id = t.id;
    RETURN 'no_change';
  END IF;

  IF target = '퇴원' THEN
    -- 정오 KST로 저장해 UTC 날짜 잘림(월말 경계)에도 같은 날로 집계되게 한다
    UPDATE public.students
    SET enrollment_status = '퇴원',
        withdrawn_at = ((apply_date + time '12:00') AT TIME ZONE 'Asia/Seoul'),
        updated_at = now()
    WHERE id = s.id;
  ELSE
    UPDATE public.students
    SET enrollment_status = target,
        updated_at = now()
    WHERE id = s.id;
  END IF;

  note := format('%s 재원상태 %s → %s (적용일 %s)',
                 s.name, COALESCE(s.enrollment_status, '재학'), target, to_char(apply_date, 'YYYY-MM-DD'));

  UPDATE public.admin_office_tasks
  SET student_sync_status = 'applied', student_sync_note = note, student_synced_at = now()
  WHERE id = t.id;

  INSERT INTO public.admin_office_task_comments (task_id, body, author_id, author_name)
  VALUES (t.id, '🔄 학생 기록 자동 반영: ' || note, t.created_by, '시스템');

  RETURN 'applied';
END;
$$;

-- 등록·수정 시 즉시 반영 트리거 (student_sync_* 갱신은 감시 컬럼이 아니므로 재귀하지 않음)
CREATE OR REPLACE FUNCTION public.trg_office_task_student_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.student_id IS NULL OR public.office_task_target_status(NEW.category) IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.student_sync_status = 'applied' THEN
    RETURN NEW;
  END IF;
  PERFORM public.apply_office_task_student_sync(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_admin_office_tasks_student_sync ON public.admin_office_tasks;
CREATE TRIGGER trg_admin_office_tasks_student_sync
AFTER INSERT OR UPDATE OF category, student_id, effective_date ON public.admin_office_tasks
FOR EACH ROW
EXECUTE FUNCTION public.trg_office_task_student_sync();

-- 기한이 된 예약분 일괄 반영. 관리자 화면(RPC)과 pg_cron이 호출한다.
CREATE OR REPLACE FUNCTION public.apply_due_office_task_student_sync()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  applied_count INTEGER := 0;
BEGIN
  -- 로그인 사용자가 호출하면 관리자만 허용. cron(auth.uid() IS NULL)은 통과.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin_staff() THEN
    RAISE EXCEPTION 'not allowed';
  END IF;

  FOR r IN
    SELECT id FROM public.admin_office_tasks
    WHERE student_sync_status = 'scheduled'
      AND COALESCE(effective_date, (now() AT TIME ZONE 'Asia/Seoul')::date) <= (now() AT TIME ZONE 'Asia/Seoul')::date
    ORDER BY effective_date, created_at
  LOOP
    IF public.apply_office_task_student_sync(r.id) = 'applied' THEN
      applied_count := applied_count + 1;
    END IF;
  END LOOP;

  RETURN applied_count;
END;
$$;

REVOKE ALL ON FUNCTION public.office_task_target_status(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.office_task_target_status(TEXT) TO authenticated;
REVOKE ALL ON FUNCTION public.apply_office_task_student_sync(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_office_task_student_sync() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_due_office_task_student_sync() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_due_office_task_student_sync() TO authenticated;

-- 매일 05:10 KST(= 20:10 UTC) 예약분 반영. pg_cron이 없거나 권한이 없으면 건너뛴다(보드 진입 시 RPC가 대신 처리).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('office-task-student-sync-daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'office-task-student-sync-daily');
    PERFORM cron.schedule(
      'office-task-student-sync-daily',
      '10 20 * * *',
      $job$ SELECT public.apply_due_office_task_student_sync(); $job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'office-task-student-sync-daily cron not scheduled: %', SQLERRM;
END $$;
