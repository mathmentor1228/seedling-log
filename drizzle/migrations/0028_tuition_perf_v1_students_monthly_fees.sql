-- TUITION-PERF-V1 (2026-11-04): 수강료 화면 속도
--   1) students_monthly_fees(월, 학생ID[]) : 학생마다 student_monthly_fee 를 따로 부르던 것(학생 87명 = RPC 87번, 약 6초)을 한 번에
--   2) payment_records(student_id, billing_month) 인덱스 : 장부가 4,663건으로 커진 뒤 학생별·월별 조회용
-- 기존 함수·표는 건드리지 않는다. 재실행해도 안전.

CREATE OR REPLACE FUNCTION public.students_monthly_fees(_month text, _student_ids uuid[] DEFAULT NULL)
RETURNS TABLE(student_id uuid, fee integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, public.student_monthly_fee(s.id, _month)
  FROM public.students s
  WHERE (_student_ids IS NULL AND s.enrollment_status IN ('재학', '재등원', '휴학'))
     OR (_student_ids IS NOT NULL AND s.id = ANY (_student_ids));
$$;
COMMENT ON FUNCTION public.students_monthly_fees(text, uuid[]) IS 'TUITION-PERF-V1 여러 학생의 해당 월 청구액을 한 번에. _student_ids 가 NULL 이면 재학·재등원·휴학 전원';
REVOKE ALL ON FUNCTION public.students_monthly_fees(text, uuid[]) FROM public;
GRANT EXECUTE ON FUNCTION public.students_monthly_fees(text, uuid[]) TO authenticated, service_role;

CREATE INDEX IF NOT EXISTS idx_payment_records_student_month
  ON public.payment_records(student_id, billing_month);