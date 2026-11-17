CREATE OR REPLACE FUNCTION public.apply_fee_change(p_student_id uuid, p_from_month text, p_new_total numeric)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _changed integer;
  _today text := to_char(now() AT TIME ZONE 'Asia/Seoul', 'YYYY-MM-DD');
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION '원장 계정만 원비 변경을 청구에 반영할 수 있습니다' USING ERRCODE = '42501';
  END IF;
  IF p_from_month IS NULL OR p_from_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION '적용 시작 달은 YYYY-MM 형식이어야 합니다';
  END IF;
  IF p_new_total IS NULL OR p_new_total < 0 THEN
    RAISE EXCEPTION '원비는 0원 이상이어야 합니다';
  END IF;

  UPDATE public.billing_schedules b
  SET base_amount = p_new_total,
      final_amount = p_new_total - COALESCE(b.discount_amount, 0) + COALESCE(b.extra_amount, 0),
      memo = concat_ws(E'\n', b.memo, format('원비 변경 반영: %s → %s (%s)',
        to_char(b.final_amount, 'FM999,999,999,990'),
        to_char(p_new_total - COALESCE(b.discount_amount, 0) + COALESCE(b.extra_amount, 0), 'FM999,999,999,990'),
        _today))
  WHERE b.student_id = p_student_id
    AND b.billing_month >= p_from_month
    AND b.billing_month >= '2026-10'
    AND b.status IN ('pending', 'overdue')
    AND (b.memo IS NULL OR b.memo NOT LIKE '%원장%')
    AND b.final_amount IS DISTINCT FROM (p_new_total - COALESCE(b.discount_amount, 0) + COALESCE(b.extra_amount, 0))
    AND NOT EXISTS (SELECT 1 FROM public.payment_records p WHERE p.billing_schedule_id = b.id)
    AND NOT EXISTS (
      SELECT 1 FROM public.payment_records p
      WHERE p.student_id = b.student_id AND p.billing_month = b.billing_month AND p.canceled_at IS NULL
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.billing_schedules o
      WHERE o.student_id = b.student_id AND o.billing_month = b.billing_month AND o.id <> b.id AND o.status <> 'cancelled'
    );

  GET DIAGNOSTICS _changed = ROW_COUNT;
  RETURN _changed;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_fee_change(uuid, text, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_fee_change(uuid, text, numeric) TO authenticated;