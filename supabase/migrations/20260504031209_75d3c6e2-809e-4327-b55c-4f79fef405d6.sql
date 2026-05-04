ALTER TABLE public.students DROP CONSTRAINT students_enrollment_status_check;
ALTER TABLE public.students ADD CONSTRAINT students_enrollment_status_check
  CHECK (enrollment_status = ANY (ARRAY['재학'::text, '재등원'::text, '휴학'::text, '퇴원'::text]));