
ALTER TABLE public.lesson_records DISABLE TRIGGER USER;

UPDATE public.lesson_records
SET teacher_id = '80aed5d8-c589-4ad3-89d2-b1ba25052c71'::uuid
WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'::uuid
  AND lesson_date <= '2026-04-30';

ALTER TABLE public.lesson_records ENABLE TRIGGER USER;

UPDATE public.profiles SET is_active = true WHERE id = '73a3d463-40e5-452e-877a-74b2044981e4';

INSERT INTO public.student_subject_teachers (student_id, subject, teacher_id)
SELECT DISTINCT cs.student_id, '영어'::text, '73a3d463-40e5-452e-877a-74b2044981e4'::uuid
FROM public.class_students cs
JOIN public.classes c ON c.id = cs.class_id
JOIN public.students s ON s.id = cs.student_id
WHERE c.subject::text = '영어'
  AND s.enrollment_status != '퇴원'
  AND NOT EXISTS (
    SELECT 1 FROM public.student_subject_teachers sst
    WHERE sst.student_id = cs.student_id AND sst.subject = '영어'
  )
ON CONFLICT DO NOTHING;
