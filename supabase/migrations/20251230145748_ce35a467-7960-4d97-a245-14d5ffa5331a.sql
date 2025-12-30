DROP VIEW IF EXISTS public.overdue_lesson_drafts;

CREATE VIEW public.overdue_lesson_drafts
WITH (security_invoker = true) AS
SELECT
  lr.id,
  lr.teacher_id,
  p.full_name AS teacher_name,
  lr.student_id,
  s.name AS student_name,
  lr.subject,
  lr.lesson_date,
  lr.draft_created_at,
  EXTRACT(EPOCH FROM (now() - lr.draft_created_at))/3600 AS overdue_hours
FROM public.lesson_records lr
JOIN public.students s ON s.id = lr.student_id
LEFT JOIN public.profiles p ON p.id = lr.teacher_id
WHERE lr.submitted = false
  AND lr.draft_created_at <= now() - interval '24 hours'
ORDER BY lr.draft_created_at ASC;