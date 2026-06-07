DELETE FROM public.student_subject_teachers sst
WHERE NOT EXISTS (
  SELECT 1
  FROM public.student_courses sc
  JOIN public.course_policies cp ON cp.id = sc.course_policy_id
  WHERE sc.student_id = sst.student_id
    AND sc.is_active = true
    AND cp.subject = sst.subject
);