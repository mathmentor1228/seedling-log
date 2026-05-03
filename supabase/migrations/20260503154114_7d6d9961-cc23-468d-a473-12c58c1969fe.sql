
CREATE OR REPLACE FUNCTION public.resolve_teacher_display_name_for_record(
  _teacher_id uuid,
  _record_date date DEFAULT CURRENT_DATE
)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE
    WHEN _teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid
      AND COALESCE(_record_date, CURRENT_DATE) < DATE '2026-05-01'
      THEN '서미정'
    WHEN _teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid
      THEN '미배정'
    ELSE COALESCE((SELECT p.full_name FROM public.profiles p WHERE p.id = _teacher_id), '알 수 없음')
  END;
$$;

UPDATE public.classes SET teacher_id = NULL WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
UPDATE public.room_assignments SET teacher_id = NULL WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
UPDATE public.student_courses SET teacher_id = NULL WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
UPDATE public.assistant_tasks SET related_teacher_id = NULL WHERE related_teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
UPDATE public.team_notes SET target_user_id = NULL WHERE target_user_id = '73a3d463-40e5-452e-877a-74b2044981e4';

DELETE FROM public.class_schedules WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
DELETE FROM public.exam_prep_courses WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
DELETE FROM public.student_subject_teachers WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
DELETE FROM public.teacher_notifications WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
DELETE FROM public.teacher_student_links WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';

UPDATE public.profiles
SET is_active = false, full_name = '미배정'
WHERE id = '73a3d463-40e5-452e-877a-74b2044981e4';

UPDATE public.lesson_records
SET teacher_display_name = public.resolve_teacher_display_name_for_record(teacher_id, lesson_date)
WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4';
