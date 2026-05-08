UPDATE public.student_exam_results
SET exam_year = COALESCE(
  exam_year,
  EXTRACT(YEAR FROM exam_date)::int,
  EXTRACT(YEAR FROM submitted_at)::int
)
WHERE exam_year IS NULL;

UPDATE public.student_exam_results
SET exam_period = CASE
  WHEN EXTRACT(MONTH FROM COALESCE(exam_date, submitted_at::date)) <= 7 THEN '1학기'
  ELSE '2학기'
END
WHERE exam_period IS NULL
  AND exam_type IN ('midterm','final');