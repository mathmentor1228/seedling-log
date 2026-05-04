-- 학생별 커스텀 월 수강료 (다과목/형제 할인 등으로 강좌 정책의 monthly_fee와 다를 때 사용)
ALTER TABLE public.student_courses
  ADD COLUMN IF NOT EXISTS custom_monthly_fee NUMERIC(10,0) NULL;

COMMENT ON COLUMN public.student_courses.custom_monthly_fee IS
  '학생별 커스텀 월 수강료. NULL이면 course_policies.monthly_fee 사용';

-- 입금자명 (실제 통장에 찍히는 이름, 학생 이름과 다를 때)
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS deposit_name TEXT NULL;

COMMENT ON COLUMN public.students.deposit_name IS
  '입금자명 (학생 이름과 다를 때 사용, 예: 부모님 이름)';
