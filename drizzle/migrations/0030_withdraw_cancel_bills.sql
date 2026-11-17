CREATE OR REPLACE FUNCTION public.cancel_bills_after_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _base_month text;
  _today text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
BEGIN
  IF NEW.enrollment_status = '휴학' THEN
    _base_month := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM');
  ELSE
    _base_month := to_char(COALESCE(NEW.withdrawal_last_class_date, (COALESCE(NEW.withdrawn_at, now()) AT TIME ZONE 'Asia/Seoul')::date), 'YYYY-MM');
  END IF;

  UPDATE public.billing_schedules b
  SET status = 'cancelled',
      memo = concat_ws(E'\n', b.memo, '자동취소: ' || NEW.enrollment_status || ' ' || _today)
  WHERE b.student_id = NEW.id
    AND b.status IN ('pending', 'overdue')
    AND b.billing_month > _base_month
    AND NOT EXISTS (SELECT 1 FROM public.payment_records p WHERE p.billing_schedule_id = b.id);

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_bills_after_withdrawal() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_cancel_bills_after_withdrawal ON public.students;
CREATE TRIGGER trg_cancel_bills_after_withdrawal
AFTER UPDATE OF enrollment_status ON public.students
FOR EACH ROW
WHEN (NEW.enrollment_status IN ('퇴원', '휴학') AND OLD.enrollment_status IS DISTINCT FROM NEW.enrollment_status)
EXECUTE FUNCTION public.cancel_bills_after_withdrawal();

-- One-time cleanup for students already withdrawn or on leave (same rule and payment guard).
UPDATE public.billing_schedules b
SET status = 'cancelled',
    memo = concat_ws(E'\n', b.memo, '자동취소: 기존 퇴원생 정리 2026-11-11')
FROM public.students s
WHERE s.id = b.student_id
  AND s.enrollment_status IN ('퇴원', '휴학')
  AND b.status IN ('pending', 'overdue')
  AND b.billing_month > to_char(COALESCE(s.withdrawal_last_class_date, (COALESCE(s.withdrawn_at, now()) AT TIME ZONE 'Asia/Seoul')::date), 'YYYY-MM')
  AND NOT EXISTS (SELECT 1 FROM public.payment_records p WHERE p.billing_schedule_id = b.id);