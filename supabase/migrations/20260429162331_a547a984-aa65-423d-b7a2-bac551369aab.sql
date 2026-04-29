ALTER TABLE public.lesson_records
ADD COLUMN IF NOT EXISTS teacher_display_name text;

ALTER TABLE public.test_records
ADD COLUMN IF NOT EXISTS teacher_display_name text;

ALTER TABLE public.clinic_records
ADD COLUMN IF NOT EXISTS teacher_display_name text;

ALTER TABLE public.self_study_records
ADD COLUMN IF NOT EXISTS teacher_display_name text;

CREATE OR REPLACE FUNCTION public.resolve_teacher_display_name_for_record(
  _teacher_id uuid,
  _record_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN _teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid
      AND COALESCE(_record_date, CURRENT_DATE) < DATE '2026-05-01'
      THEN '서미정'
    WHEN _teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid
      THEN '고대영'
    ELSE COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = _teacher_id), '알 수 없음')
  END;
$$;

CREATE OR REPLACE FUNCTION public.set_lesson_record_teacher_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.teacher_id IS NOT NULL THEN
    NEW.teacher_display_name := public.resolve_teacher_display_name_for_record(NEW.teacher_id, NEW.lesson_date);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_test_record_teacher_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.teacher_id IS NOT NULL THEN
    NEW.teacher_display_name := public.resolve_teacher_display_name_for_record(NEW.teacher_id, NEW.test_date);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_clinic_record_teacher_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.teacher_id IS NOT NULL THEN
    NEW.teacher_display_name := public.resolve_teacher_display_name_for_record(NEW.teacher_id, NEW.clinic_date);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_self_study_record_teacher_display_name()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.teacher_id IS NOT NULL THEN
    NEW.teacher_display_name := public.resolve_teacher_display_name_for_record(NEW.teacher_id, NEW.study_date);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lesson_records_teacher_display_name ON public.lesson_records;
CREATE TRIGGER trg_lesson_records_teacher_display_name
BEFORE INSERT OR UPDATE OF teacher_id, lesson_date ON public.lesson_records
FOR EACH ROW
EXECUTE FUNCTION public.set_lesson_record_teacher_display_name();

DROP TRIGGER IF EXISTS trg_test_records_teacher_display_name ON public.test_records;
CREATE TRIGGER trg_test_records_teacher_display_name
BEFORE INSERT OR UPDATE OF teacher_id, test_date ON public.test_records
FOR EACH ROW
EXECUTE FUNCTION public.set_test_record_teacher_display_name();

DROP TRIGGER IF EXISTS trg_clinic_records_teacher_display_name ON public.clinic_records;
CREATE TRIGGER trg_clinic_records_teacher_display_name
BEFORE INSERT OR UPDATE OF teacher_id, clinic_date ON public.clinic_records
FOR EACH ROW
EXECUTE FUNCTION public.set_clinic_record_teacher_display_name();

DROP TRIGGER IF EXISTS trg_self_study_records_teacher_display_name ON public.self_study_records;
CREATE TRIGGER trg_self_study_records_teacher_display_name
BEFORE INSERT OR UPDATE OF teacher_id, study_date ON public.self_study_records
FOR EACH ROW
EXECUTE FUNCTION public.set_self_study_record_teacher_display_name();

UPDATE public.lesson_records
SET teacher_display_name = public.resolve_teacher_display_name_for_record(teacher_id, lesson_date)
WHERE teacher_id IS NOT NULL
  AND (teacher_display_name IS NULL OR teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid);

UPDATE public.test_records
SET teacher_display_name = public.resolve_teacher_display_name_for_record(teacher_id, test_date)
WHERE teacher_id IS NOT NULL
  AND (teacher_display_name IS NULL OR teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid);

UPDATE public.clinic_records
SET teacher_display_name = public.resolve_teacher_display_name_for_record(teacher_id, clinic_date)
WHERE teacher_id IS NOT NULL
  AND (teacher_display_name IS NULL OR teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid);

UPDATE public.self_study_records
SET teacher_display_name = public.resolve_teacher_display_name_for_record(teacher_id, study_date)
WHERE teacher_id IS NOT NULL
  AND (teacher_display_name IS NULL OR teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid);

INSERT INTO public.ops_changelog (log_date, log_type, target, content, author_name)
VALUES (
  CURRENT_DATE,
  'teacher_change',
  '서미정 → 고대영',
  '서미정 선생님 기존 기록은 기록 당시 담당자명(서미정)으로 보존하고, 2026년 5월 1일부터 동일 계정의 신규 기록 및 담당 표시는 고대영 선생님으로 적용되도록 정정함.',
  'Lovable'
);