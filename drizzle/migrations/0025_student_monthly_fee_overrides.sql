-- TUITION-FEE-OVERRIDE-V1 (Lovable 요청 #27, 2026-10-23)
-- 학생별 "월 원비 고정"을 적용 시작월부터 반영한다. 과거 달의 계산은 바뀌지 않는다.
-- 배경: 유나린 10월 525,000 → 11월부터 600,000. student_courses 는 (student_id, course_policy_id) 유일 제약이라
--       같은 과정을 날짜로 쪼갤 수 없고, custom_monthly_fee 를 바꾸면 지난 달 계산까지 바뀐다.

-- 1) 고정표 ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.student_fee_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  from_month text NOT NULL CHECK (from_month ~ '^\d{4}-\d{2}$'),
  amount integer NOT NULL CHECK (amount >= 0),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, from_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.student_fee_overrides TO authenticated;
GRANT ALL ON public.student_fee_overrides TO service_role;
COMMENT ON TABLE public.student_fee_overrides IS 'TUITION-FEE-OVERRIDE-V1 학생별 월 원비 고정. from_month(YYYY-MM)부터 amount 를 그 학생의 월 원비로 쓴다. 가장 최근 from_month 한 행만 적용';
CREATE INDEX IF NOT EXISTS idx_student_fee_overrides_student ON public.student_fee_overrides(student_id, from_month DESC);

ALTER TABLE public.student_fee_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff can view student_fee_overrides" ON public.student_fee_overrides;
CREATE POLICY "staff can view student_fee_overrides" ON public.student_fee_overrides
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "admin can manage student_fee_overrides" ON public.student_fee_overrides;
CREATE POLICY "admin can manage student_fee_overrides" ON public.student_fee_overrides
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2) 월 원비 함수: 고정표가 있으면 그 값을 돌려준다 (휴학·퇴원 0 은 그대로 우선) ----
CREATE OR REPLACE FUNCTION public.student_monthly_fee(_student_id uuid, _month text)
RETURNS integer
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _start date;
  _end date;
  _status text;
  _sibling_group integer;
  _override integer;
  _gross integer := 0;
  _subjects integer := 0;
  _has_custom boolean := false;
  _sibling_cnt integer := 0;
  _discount integer := 0;
BEGIN
  IF _month !~ '^\d{4}-\d{2}$' THEN
    RAISE EXCEPTION 'month must be YYYY-MM, got %', _month;
  END IF;
  _start := to_date(_month || '-01', 'YYYY-MM-DD');
  _end := (_start + interval '1 month' - interval '1 day')::date;

  SELECT enrollment_status, sibling_group_id INTO _status, _sibling_group
  FROM public.students WHERE id = _student_id;
  IF _status IS NULL OR _status NOT IN ('재학', '재등원') THEN
    RETURN 0;
  END IF;

  -- 고정표: 적용 시작월이 조회월 이하인 것 중 가장 최근 한 행
  SELECT amount INTO _override
  FROM public.student_fee_overrides
  WHERE student_id = _student_id AND from_month <= _month
  ORDER BY from_month DESC
  LIMIT 1;
  IF _override IS NOT NULL THEN
    RETURN _override;
  END IF;

  SELECT
    COALESCE(SUM(COALESCE(sc.custom_monthly_fee, cp.monthly_fee)), 0)::integer,
    COUNT(DISTINCT cp.subject)::integer,
    bool_or(sc.custom_monthly_fee IS NOT NULL)
  INTO _gross, _subjects, _has_custom
  FROM public.student_courses sc
  JOIN public.course_policies cp ON cp.id = sc.course_policy_id
  WHERE sc.student_id = _student_id
    AND sc.is_active
    AND sc.enrollment_date <= _end
    AND (sc.end_date IS NULL OR sc.end_date >= _start);

  IF _gross = 0 THEN
    RETURN 0;
  END IF;

  IF NOT COALESCE(_has_custom, false) THEN
    _discount := CASE
      WHEN _subjects >= 4 THEN 100000
      WHEN _subjects = 3 THEN 80000
      WHEN _subjects = 2 THEN 50000
      ELSE 0 END;
    IF _sibling_group IS NOT NULL THEN
      SELECT COUNT(*) INTO _sibling_cnt FROM public.students
      WHERE sibling_group_id = _sibling_group AND enrollment_status <> '퇴원';
      IF _sibling_cnt > 1 THEN
        _discount := _discount + 10000;
      END IF;
    END IF;
  END IF;

  RETURN GREATEST(0, _gross - _discount);
END;
$$;
COMMENT ON FUNCTION public.student_monthly_fee(uuid, text) IS 'TUITION-LEDGER-V1 학생의 해당 월 청구액. 고정표(student_fee_overrides)가 있으면 그 값(#27). 화면들은 이 함수 결과를 쓴다(#26)';
REVOKE ALL ON FUNCTION public.student_monthly_fee(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.student_monthly_fee(uuid, text) TO authenticated, service_role;

-- 3) 유나린: 2026-11부터 600,000 고정 (원장 지시 2026-10-23) ----------------------
INSERT INTO public.student_fee_overrides (student_id, from_month, amount, note)
SELECT s.id, '2026-11', 600000, '원장 지시 2026-10-23: 11월부터 수학+영어 월 600,000 고정 (10월은 525,000 그대로)'
FROM public.students s
WHERE s.name = '유나린' AND s.enrollment_status IN ('재학', '재등원')
ON CONFLICT (student_id, from_month) DO UPDATE SET amount = EXCLUDED.amount, note = EXCLUDED.note;

-- 이미 만들어진 2026-11 청구 행(대기 상태)만 함수값으로 맞춘다
UPDATE public.billing_schedules b
SET base_amount = 600000,
    final_amount = 600000 - COALESCE(b.discount_amount, 0) + COALESCE(b.extra_amount, 0)
FROM public.students s
WHERE s.id = b.student_id
  AND s.name = '유나린'
  AND b.billing_month = '2026-11'
  AND b.status = 'pending';
