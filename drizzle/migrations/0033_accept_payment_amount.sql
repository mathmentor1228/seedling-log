CREATE OR REPLACE FUNCTION public.accept_payment_amount(p_payment_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _p record;
  _bill_id uuid;
  _candidates integer;
  _today text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
BEGIN
  -- Same writers as the billing_schedules / payment_records update policies.
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION '원장 계정만 청구 금액을 수정할 수 있습니다' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _p FROM public.payment_records WHERE id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION '납부 기록을 찾을 수 없습니다';
  END IF;
  IF _p.canceled_at IS NOT NULL THEN
    RAISE EXCEPTION '취소된 납부 기록입니다';
  END IF;
  IF NOT COALESCE(_p.needs_review, false) OR _p.billing_schedule_id IS NOT NULL THEN
    RAISE EXCEPTION '이미 처리된 납부 기록입니다';
  END IF;
  IF _p.student_id IS NULL OR _p.billing_month IS NULL THEN
    RAISE EXCEPTION '학생이나 청구월이 정해지지 않은 납부입니다. 확인 필요 탭에서 먼저 지정해 주세요';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.payment_records o
    WHERE o.student_id = _p.student_id AND o.billing_month = _p.billing_month
      AND o.id <> _p.id AND o.canceled_at IS NULL
  ) THEN
    RAISE EXCEPTION '같은 달에 다른 납부 기록이 있어 자동으로 바꿀 수 없습니다';
  END IF;

  SELECT count(*) INTO _candidates
  FROM public.billing_schedules b
  WHERE b.student_id = _p.student_id AND b.billing_month = _p.billing_month
    AND b.status IN ('pending', 'overdue')
    AND NOT EXISTS (SELECT 1 FROM public.payment_records x WHERE x.billing_schedule_id = b.id AND x.canceled_at IS NULL);
  IF _candidates = 0 THEN
    RAISE EXCEPTION '% 청구가 없어 수정할 수 없습니다', _p.billing_month;
  END IF;
  IF _candidates > 1 THEN
    RAISE EXCEPTION '% 미납 청구가 여러 건이라 자동으로 고를 수 없습니다', _p.billing_month;
  END IF;

  SELECT b.id INTO _bill_id
  FROM public.billing_schedules b
  WHERE b.student_id = _p.student_id AND b.billing_month = _p.billing_month
    AND b.status IN ('pending', 'overdue')
    AND NOT EXISTS (SELECT 1 FROM public.payment_records x WHERE x.billing_schedule_id = b.id AND x.canceled_at IS NULL)
  FOR UPDATE;

  UPDATE public.billing_schedules
  SET final_amount = _p.amount,
      memo = concat_ws(E'\n', memo, format('원장 확인: 납부액으로 수정 %s', _today)),
      status = 'paid'
  WHERE id = _bill_id;

  UPDATE public.payment_records
  SET billing_schedule_id = _bill_id,
      needs_review = false
  WHERE id = _p.id;

  RETURN _bill_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_payment_amount(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_payment_amount(uuid) TO authenticated;