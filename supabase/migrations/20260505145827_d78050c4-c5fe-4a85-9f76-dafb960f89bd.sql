-- Restore 서미정 teacher profile name (kept inactive as 퇴사) so historical records remain traceable
UPDATE public.profiles
SET full_name = '서미정'
WHERE id = '73a3d463-40e5-452e-877a-74b2044981e4';

-- Update resolver: future records (after 2026-05-01) for this teacher_id show '서미정 (퇴사)' fallback.
-- Historical records still show '서미정'. Profile lookup also returns 서미정.
CREATE OR REPLACE FUNCTION public.resolve_teacher_display_name_for_record(
  _teacher_id uuid,
  _record_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN _teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid
      THEN '서미정'
    ELSE COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = _teacher_id), '알 수 없음')
  END;
$$;

-- Re-apply teacher_display_name across record tables for this teacher
UPDATE public.lesson_records
SET teacher_display_name = '서미정'
WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';

UPDATE public.test_records
SET teacher_display_name = '서미정'
WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';

UPDATE public.clinic_records
SET teacher_display_name = '서미정'
WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';

UPDATE public.self_study_records
SET teacher_display_name = '서미정'
WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';