DELETE FROM public.student_subject_teachers
WHERE subject = '국어'
  AND teacher_id IN (SELECT id FROM public.profiles WHERE full_name = '최윤기');