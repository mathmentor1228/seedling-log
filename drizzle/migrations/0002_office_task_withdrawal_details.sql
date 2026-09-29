ALTER TABLE public.admin_office_tasks
  ADD COLUMN IF NOT EXISTS withdrawal_last_class_date DATE,
  ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS withdrawal_last_class_date DATE,
  ADD COLUMN IF NOT EXISTS withdrawal_reason TEXT;
COMMENT ON COLUMN public.admin_office_tasks.withdrawal_last_class_date IS '퇴원 기준 마지막 수업일';
COMMENT ON COLUMN public.students.withdrawal_reason IS '퇴원 사유 (행정 업무 퇴원 안내에서 기록)';