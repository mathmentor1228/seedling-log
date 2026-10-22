-- TUITION-LEDGER-V1 (2026-10-22): 원비 수납 장부 1단계 — DB 변경 + 데이터 정리
-- 설계: vault 21번 "원비 수납 자동화 설계안", 22번 "입금자명 별칭 검토표", 23번 "선행 데이터 정리 목록".
-- 앱의 payment_records 를 유일한 수납 장부로 쓴다. 결제선생·이코딩·신한 입금 문자는 맥 로컬 수집기가 읽어
-- 이 표에 넣는다(수집기는 앱 밖, 이 마이그레이션 범위 아님). 화면 재편은 다음 요청(#26).
--   1) payment_records  출처·외부ID·원문·매칭방식·청구월·확인필요 컬럼 추가, (source, external_id) 중복 방지
--   2) deposit_aliases  입금자명 → 학생 별칭표 (+ 원비 아님 무시 목록) + 초기 데이터
--   3) tuition_reminders 학부모 알림톡 발송 기록 (같은 학생·월·차수 1회)
--   4) academy_profile   영수증·알림톡용 학원 정보 1행 (사업장 전환 시 여기만 바꿈)
--   5) student_monthly_fee(student_id, month) 청구액 계산 함수 하나로 통일 (화면 4곳 복사 로직의 정본)
--   6) 데이터 정리: 퇴원생 수강과정 종료, 테스트 학생 퇴원 처리, 여름특강 17건 청구월·학생 연결, deposit_name 보강
-- 기존 표·정책은 지우지 않는다. 모든 변경은 IF NOT EXISTS / 조건부 UPDATE 로 재실행해도 안전하다.

-- 1) payment_records 확장 --------------------------------------------------
ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT '수기',
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS raw_text text,
  ADD COLUMN IF NOT EXISTS matched_by text,
  ADD COLUMN IF NOT EXISTS billing_month text,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS canceled_at timestamptz;

COMMENT ON COLUMN public.payment_records.source IS 'TUITION-LEDGER-V1 출처: 결제선생 | 이코딩키오스크 | 이코딩수기 | 계좌이체문자 | 수기';
COMMENT ON COLUMN public.payment_records.external_id IS '출처 고유키: 결제선생 승인번호 / 이코딩 거래번호 / 문자 ROWID. 같은 출처에서 두 번 안 들어오게';
COMMENT ON COLUMN public.payment_records.raw_text IS '읽은 원문(문자 본문, 표 한 줄). 나중에 다시 볼 수 있게';
COMMENT ON COLUMN public.payment_records.matched_by IS '학생 매칭 방식: phone | name | alias | manual';
COMMENT ON COLUMN public.payment_records.billing_month IS '귀속 청구월 YYYY-MM. 납부일 D 기준 D-15 ~ D+14 입금은 그 달분(선불)';
COMMENT ON COLUMN public.payment_records.needs_review IS '확인 필요 큐: 별칭 없음·금액 불일치·부분납·형제 합산 불일치';
COMMENT ON COLUMN public.payment_records.canceled_at IS '결제선생 취소 등. 영수증 번호는 유지하고 취소 표시만';

ALTER TABLE public.payment_records
  DROP CONSTRAINT IF EXISTS payment_records_source_check;
ALTER TABLE public.payment_records
  ADD CONSTRAINT payment_records_source_check
  CHECK (source IN ('결제선생','이코딩키오스크','이코딩수기','계좌이체문자','수기'));

CREATE UNIQUE INDEX IF NOT EXISTS uq_payment_records_source_external
  ON public.payment_records(source, external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_records_billing_month
  ON public.payment_records(billing_month);
CREATE INDEX IF NOT EXISTS idx_payment_records_needs_review
  ON public.payment_records(needs_review) WHERE needs_review;

-- 2) deposit_aliases ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.deposit_aliases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alias_name text NOT NULL,
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE,
  is_ignore boolean NOT NULL DEFAULT false,
  confidence text NOT NULL DEFAULT '원장확인',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deposit_aliases_target CHECK (is_ignore OR student_id IS NOT NULL)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.deposit_aliases TO authenticated;
GRANT ALL ON public.deposit_aliases TO service_role;
COMMENT ON TABLE public.deposit_aliases IS 'TUITION-LEDGER-V1 입금자명 → 학생 별칭표. is_ignore=true 는 원비 아님(가족 이체·카드사·수당 등) 자동 무시';
CREATE UNIQUE INDEX IF NOT EXISTS uq_deposit_aliases_name_student
  ON public.deposit_aliases(alias_name, COALESCE(student_id, '00000000-0000-0000-0000-000000000000'::uuid));
CREATE INDEX IF NOT EXISTS idx_deposit_aliases_name ON public.deposit_aliases(alias_name);

ALTER TABLE public.deposit_aliases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff can view deposit_aliases" ON public.deposit_aliases;
CREATE POLICY "staff can view deposit_aliases" ON public.deposit_aliases
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "admin can manage deposit_aliases" ON public.deposit_aliases;
CREATE POLICY "admin can manage deposit_aliases" ON public.deposit_aliases
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 초기 데이터: 22번 검토표 §C (2026-10-22 원장 확인). 이름으로 학생을 찾아 넣고, 못 찾으면 건너뛴다.
INSERT INTO public.deposit_aliases (alias_name, student_id, confidence, note)
SELECT v.alias_name, s.id, '원장확인', v.note
FROM (VALUES
  ('성샛별',        '진보희', '어머님'),
  ('정춘이',        '임아영', '어머님'),
  ('이영실',        '박지현', '어머님'),
  ('박지현',        '박지현', '본인'),
  ('박성준',        '박은서', '아버님'),
  ('박은서',        '박은서', '본인'),
  ('허승무',        '허금빈', '아버님'),
  ('허금빈',        '허금빈', '본인'),
  ('이시율-특강비', '이시율', '본인(접미사)'),
  ('이시율-영어',   '이시율', '본인(접미사)'),
  ('인드라교육비',  '인드라', '본인(접미사)'),
  ('인드라학원비',  '인드라', '본인(접미사)'),
  ('이도연교육비',  '이도연', '본인(접미사), 형제 이도건은 퇴원'),
  ('정현우',        '정현우', '본인'),
  ('이민경',        '정현우', '앱 deposit_name 기존값'),
  ('안기동',        '안기동', '본인'),
  ('김주원',        '김주원', '본인'),
  ('김은채',        '김은채', '본인'),
  ('김은새',        '김은새', '본인'),
  ('이지아',        '이지아', '본인'),
  -- 2026-10-23 추가 (5/28~10/22 문자 동기화 후 원장 확인, 22번 §D)
  ('서호',          '서동희', '보호자, 월 72만'),
  ('박미령',        '허금빈', '어머님. 2026-09-17 66만은 미납 2개월분(10월 원비 아님)'),
  ('이소영',        '안기동', '어머님'),
  ('김정택(엠에스', '김민찬', '아버님'),
  ('이지아89',      '이지아', '본인(접미사)'),
  ('박수빈특강비',  '박수빈', '본인(접미사), 특강비'),
  ('한슬기7월분',   '한슬기', '본인(접미사)'),
  ('이루아(7월원비','이루아', '본인(접미사), 차액'),
  ('보육료인드라',  '인드라', '보육료 명의 입금, 원장 재확인')
) AS v(alias_name, student_name, note)
JOIN public.students s ON s.name = v.student_name
ON CONFLICT DO NOTHING;

INSERT INTO public.deposit_aliases (alias_name, student_id, is_ignore, confidence, note)
SELECT v.alias_name, NULL, true, '원장확인', v.note
FROM (VALUES
  ('황은지',         '예금주 본인·가족 이체'),
  ('최윤기',         '원장 본인'),
  ('황성수',         '가족 이체'),
  ('조인경',         '원비 아님'),
  ('신한카드캐시백', '카드사'),
  ('롯데카드환불',   '카드사 환불'),
  ('삼성카드',       '카드사'),
  ('예금이자',       '이자'),
  ('카카오(c)',      '카카오페이 소액'),
  ('아동권리과',     '아동수당'),
  ('아동수당1월',    '아동수당'),
  ('아동수당3월',    '아동수당'),
  ('아동수당4월',    '아동수당'),
  ('아동수당5월',    '아동수당'),
  ('으뜸효율환급',   '환급금'),
  ('311-255-409855','계좌 간 이체'),
  -- 2026-10-23 추가
  ('아동수당6월',    '아동수당'),
  ('아동수당7월',    '아동수당'),
  ('아동수당8월',    '아동수당'),
  ('아동수당9월',    '아동수당'),
  ('동안산세무서',   '세무서 환급'),
  ('환급안산단원',   '환급금'),
  ('건강보험환급',   '환급금'),
  ('장기요양환급',   '환급금'),
  ('현대카드',       '카드사'),
  ('아정당',         '원비 아님')
) AS v(alias_name, note)
ON CONFLICT DO NOTHING;

-- 3) tuition_reminders --------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tuition_reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  billing_month text NOT NULL,
  stage smallint NOT NULL CHECK (stage IN (1, 2)),
  sent_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT '알림톡',
  result text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, billing_month, stage)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tuition_reminders TO authenticated;
GRANT ALL ON public.tuition_reminders TO service_role;
COMMENT ON TABLE public.tuition_reminders IS 'TUITION-LEDGER-V1 학부모 수강료 안내 발송 기록. 1차=납부일+5일, 2차=+8일, +9일부터는 원장 직접 확인';

ALTER TABLE public.tuition_reminders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff can view tuition_reminders" ON public.tuition_reminders;
CREATE POLICY "staff can view tuition_reminders" ON public.tuition_reminders
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "admin can manage tuition_reminders" ON public.tuition_reminders;
CREATE POLICY "admin can manage tuition_reminders" ON public.tuition_reminders
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 4) academy_profile ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academy_profile (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  academy_name text NOT NULL,
  registration_no text NOT NULL,
  representative text NOT NULL,
  address text NOT NULL,
  bank_name text NOT NULL,
  bank_account text NOT NULL,
  bank_holder text NOT NULL,
  payssam_merchant text NOT NULL,
  phone text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_profile TO authenticated;
GRANT ALL ON public.academy_profile TO service_role;
COMMENT ON TABLE public.academy_profile IS 'TUITION-LEDGER-V1 영수증(별지 제24호서식)·알림톡·결제선생 사업장 선택에 쓰는 학원 정보 1행. 2027 상반기 멘토수학과학학원 전환 시 이 행만 바꾼다';

INSERT INTO public.academy_profile
  (id, academy_name, registration_no, representative, address, bank_name, bank_account, bank_holder, payssam_merchant)
VALUES
  (1, '더멘토학원', '제4736호', '최윤기', '경기도 안산시 단원구 새뿔길 47, 301호',
   '신한은행', '110-265-698329', '황은지', '더 멘토학원')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.academy_profile ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "staff can view academy_profile" ON public.academy_profile;
CREATE POLICY "staff can view academy_profile" ON public.academy_profile
  FOR SELECT TO authenticated USING (public.is_staff());
DROP POLICY IF EXISTS "admin can manage academy_profile" ON public.academy_profile;
CREATE POLICY "admin can manage academy_profile" ON public.academy_profile
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 5) student_monthly_fee ------------------------------------------------------
-- 규칙(StudentCoursesTuitionTab·BillingGenerator·TuitionCalendarDashboard·IncomeManagementPage 와 동일):
--   · 활성 수강과정의 월액 합 (custom_monthly_fee 있으면 그 값, 없으면 course_policies.monthly_fee)
--   · custom_monthly_fee 가 하나라도 있으면 할인 없음 (이미 반영된 금액)
--   · 없으면 과목 수 할인 1:0 / 2:5만 / 3:8만 / 4+:10만 + 형제 할인 1만 (형제 그룹에 퇴원 아닌 학생 2명 이상)
--   · 0 미만이면 0
--   · 추가(2026-10-22 결정): 휴학·퇴원 상태면 0. 수강과정은 그 달 1일 기준으로 살아 있던 것만 센다
--     (enrollment_date <= 그 달 말일, end_date 가 없거나 >= 그 달 1일)
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
COMMENT ON FUNCTION public.student_monthly_fee(uuid, text) IS 'TUITION-LEDGER-V1 학생의 해당 월 청구액. 화면들은 이 함수 결과를 쓰고 자체 계산을 버린다(#26)';
REVOKE ALL ON FUNCTION public.student_monthly_fee(uuid, text) FROM public;
GRANT EXECUTE ON FUNCTION public.student_monthly_fee(uuid, text) TO authenticated, service_role;

-- 6) 데이터 정리 (23번 노트, 2026-10-22 원장 결정) ----------------------------
-- 6-1) 퇴원생의 활성 수강과정 종료 (휴학 2명은 유지, 청구는 함수가 0 처리)
UPDATE public.student_courses sc
SET is_active = false,
    end_date = COALESCE(sc.end_date, s.withdrawal_last_class_date, s.withdrawn_at::date, CURRENT_DATE),
    notes = COALESCE(sc.notes || E'\n', '') || '2026-10-22 퇴원생 수강과정 일괄 종료 (TUITION-LEDGER-V1)',
    updated_at = now()
FROM public.students s
WHERE s.id = sc.student_id
  AND sc.is_active
  AND s.enrollment_status NOT IN ('재학', '재등원', '휴학');

-- 6-2) 테스트 학생 레코드 "최윤기"(재학, 수강과정 없음) → 퇴원 처리 (삭제 아님)
UPDATE public.students s
SET enrollment_status = '퇴원',
    withdrawn_at = COALESCE(s.withdrawn_at, now()),
    withdrawal_reason = COALESCE(s.withdrawal_reason, '테스트 레코드 정리 (2026-10-22)'),
    updated_at = now()
WHERE s.name = '최윤기'
  AND s.enrollment_status = '재학'
  AND NOT EXISTS (SELECT 1 FROM public.student_courses sc WHERE sc.student_id = s.id AND sc.is_active);

-- 6-3) 2026년 여름특강 신청 17건: 청구월 2026-07, 이름이 정확히 하나 맞는 학생만 연결 (수납 기록은 넣지 않음)
UPDATE public.intensive_applications ia
SET billed_month = '2026-07'
WHERE ia.billed_month IS NULL
  AND ia.created_at >= '2026-07-01' AND ia.created_at < '2026-08-01';

UPDATE public.intensive_applications ia
SET student_id = m.id
FROM (
  SELECT s.name, MIN(s.id::text)::uuid AS id
  FROM public.students s
  GROUP BY s.name
  HAVING COUNT(*) = 1
) m
WHERE ia.student_id IS NULL
  AND ia.billed_month = '2026-07'
  AND m.name = ia.child_name;

-- 6-4) students.deposit_name 이 비어 있는 재학생에게 별칭표 대표값 채우기 (학생 이름과 다른 별칭만)
UPDATE public.students s
SET deposit_name = a.alias_name, updated_at = now()
FROM (
  SELECT DISTINCT ON (student_id) student_id, alias_name
  FROM public.deposit_aliases
  WHERE NOT is_ignore AND student_id IS NOT NULL
  ORDER BY student_id, created_at
) a
WHERE a.student_id = s.id
  AND s.deposit_name IS NULL
  AND a.alias_name <> s.name;
