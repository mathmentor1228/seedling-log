-- CHECKBUS-IMPORT-V1 (2026-11-04): 출결버스 과거 수납기록 이관을 받을 그릇
-- 설계: vault 28번 "출결버스 과거 수납기록 이관 설계안". 데이터는 맥 로컬 checkbus_import.py 가 REST 로 넣는다(이 마이그레이션 범위 아님).
--   1) students.checkbus_uid       출결버스 학생 ID (재등원이면 쉼표로 여러 개). 두 번 돌려도 같은 학생을 다시 만들지 않게.
--   2) payment_records.source      '출결버스' 값 허용
--   3) 영수증 번호 트리거          출처가 출결버스인 과거 수납에는 번호를 붙이지 않는다 (영수증은 출결버스 시절 발급분, 2026-NNNN 채번을 오염시키지 않음)
-- 기존 표·정책·데이터는 지우지 않는다. 재실행해도 안전.

-- 1) students.checkbus_uid ----------------------------------------------------
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS checkbus_uid text;
COMMENT ON COLUMN public.students.checkbus_uid IS 'CHECKBUS-IMPORT-V1 출결버스 학생 ID. 재등원으로 ID가 둘이면 쉼표 구분 (예: 2221,7743)';
CREATE INDEX IF NOT EXISTS idx_students_checkbus_uid ON public.students(checkbus_uid) WHERE checkbus_uid IS NOT NULL;

-- 2) source 에 '출결버스' 추가 -----------------------------------------------------
ALTER TABLE public.payment_records DROP CONSTRAINT IF EXISTS payment_records_source_check;
ALTER TABLE public.payment_records
  ADD CONSTRAINT payment_records_source_check
  CHECK (source IN ('결제선생','이코딩키오스크','이코딩수기','계좌이체문자','수기','출결버스'));
COMMENT ON COLUMN public.payment_records.source IS '출처: 결제선생 | 이코딩키오스크 | 이코딩수기 | 계좌이체문자 | 수기 | 출결버스(2022-02~2026-09 과거 이관, 영수증 번호 없음)';

-- 3) 영수증 번호: 출결버스 행은 건너뛴다 ---------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_tuition_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_year integer;
  next_number integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.receipt_number IS NOT NULL AND NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN
      RAISE EXCEPTION 'An assigned receipt number cannot be changed';
    END IF;
    RETURN NEW;
  END IF;
  -- CHECKBUS-IMPORT-V1: 출결버스 과거 이관분은 영수증 번호를 부여하지 않는다
  IF NEW.source = '출결버스' THEN
    NEW.receipt_number := NULL;
    RETURN NEW;
  END IF;
  receipt_year := EXTRACT(YEAR FROM NEW.paid_date)::integer;
  PERFORM pg_advisory_xact_lock(4736, receipt_year);
  SELECT COALESCE(MAX(split_part(receipt_number, '-', 2)::integer), 0) + 1
    INTO next_number
    FROM public.payment_records
    WHERE receipt_number ~ ('^' || receipt_year::text || '-[0-9]+$');
  NEW.receipt_number := receipt_year::text || '-' || lpad(next_number::text, GREATEST(4, length(next_number::text)), '0');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_tuition_receipt_number() FROM PUBLIC;