-- Add unique constraint on holidays for (holiday_date, scope, teacher_id)
-- Use COALESCE for teacher_id to handle NULLs in unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_holidays_unique ON public.holidays (
  holiday_date, 
  scope, 
  COALESCE(teacher_id, '00000000-0000-0000-0000-000000000000'::uuid)
);