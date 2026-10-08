-- HW-STATUS-UNIFY-V1 (2026-10-09)
-- 목적: 수업일지(lesson_records.homework_status)에 '완료/부분/미이행'이 기록되면
--       그 학생·과목의 "직전 숙제 묶음"(lesson_date 이전 가장 최근 assigned_date)을
--       homework_assignments 에 자동으로 '확인' 처리한다.
-- 배경: 입력 화면이 여러 개라 일지엔 완료로 적히는데 숙제표는 미확인으로 남아
--       앱 숙제 통계(확인된 숙제만 집계)가 실제보다 낮게 나옴 (2026-08 중순 이후 심화).
-- 원칙: 이미 확인된(check_status='checked') 숙제는 절대 덮어쓰지 않는다.
--       같은 일지에서 새로 낸 숙제(lesson_record_id = 이 일지)는 대상이 아니다.
--       21일보다 오래된 숙제는 건드리지 않는다.

CREATE OR REPLACE FUNCTION public.apply_lesson_homework_status(
  _lesson_id uuid, _student_id uuid, _subject subject_type, _lesson_date date,
  _status text, _teacher_id uuid
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _batch_date date;
  _result text;
  _n integer := 0;
  _by uuid;
BEGIN
  IF _status NOT IN ('completed', 'partial', 'not_done') THEN
    RETURN 0;
  END IF;
  _result := _status;  -- lesson_records.homework_status 와 homework_assignments.result 값이 동일 체계

  SELECT max(h.assigned_date) INTO _batch_date
  FROM public.homework_assignments h
  WHERE h.student_id = _student_id
    AND h.subject = _subject
    AND h.assigned_date < _lesson_date
    AND h.assigned_date >= _lesson_date - 21
    AND (h.lesson_record_id IS NULL OR h.lesson_record_id <> _lesson_id);
  IF _batch_date IS NULL THEN
    RETURN 0;
  END IF;

  _by := COALESCE(auth.uid(), _teacher_id);

  UPDATE public.homework_assignments h
     SET check_status = 'checked',
         result = _result,
         checked_by = _by,
         checked_at = now(),
         notes = COALESCE(h.notes, '[수업일지 숙제 상태 자동 반영]')
   WHERE h.student_id = _student_id
     AND h.subject = _subject
     AND h.assigned_date = _batch_date
     AND (h.lesson_record_id IS NULL OR h.lesson_record_id <> _lesson_id)
     AND h.check_status <> 'checked';
  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN _n;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_sync_homework_check_from_lesson()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NEW.homework_status IN ('completed', 'partial', 'not_done')
     AND (TG_OP = 'INSERT' OR OLD.homework_status IS DISTINCT FROM NEW.homework_status) THEN
    PERFORM public.apply_lesson_homework_status(
      NEW.id, NEW.student_id, NEW.subject, NEW.lesson_date, NEW.homework_status, NEW.teacher_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_homework_check_from_lesson ON public.lesson_records;
CREATE TRIGGER trg_sync_homework_check_from_lesson
  AFTER INSERT OR UPDATE OF homework_status ON public.lesson_records
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sync_homework_check_from_lesson();

-- 과거분 보정: _since 이후 제출된 일지에 대해 같은 규칙을 날짜순으로 적용한다.
-- 이미 확인된 숙제는 건드리지 않으므로 여러 번 실행해도 결과가 같다(멱등).
-- 실행 예: SELECT public.backfill_homework_check_from_lessons('2026-08-15');
CREATE OR REPLACE FUNCTION public.backfill_homework_check_from_lessons(_since date)
RETURNS TABLE(lessons_scanned integer, homework_checked integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  r record;
  _scanned integer := 0;
  _checked integer := 0;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'ADMIN_ONLY';
  END IF;
  FOR r IN
    SELECT id, student_id, subject, lesson_date, homework_status, teacher_id
    FROM public.lesson_records
    WHERE lesson_date >= _since
      AND submitted = true
      AND homework_status IN ('completed', 'partial', 'not_done')
    ORDER BY lesson_date, created_at
  LOOP
    _scanned := _scanned + 1;
    _checked := _checked + public.apply_lesson_homework_status(
      r.id, r.student_id, r.subject, r.lesson_date, r.homework_status, r.teacher_id);
  END LOOP;
  RETURN QUERY SELECT _scanned, _checked;
END;
$$;

COMMENT ON FUNCTION public.apply_lesson_homework_status IS 'HW-STATUS-UNIFY-V1: 일지 숙제 상태 → 직전 숙제 묶음 확인 처리 (이미 확인된 행은 보존)';
COMMENT ON TRIGGER trg_sync_homework_check_from_lesson ON public.lesson_records IS 'HW-STATUS-UNIFY-V1: 입력 화면과 무관하게 일지 완료/부분/미이행을 숙제표에 반영';
