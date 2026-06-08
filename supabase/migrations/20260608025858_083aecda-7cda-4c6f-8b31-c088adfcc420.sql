ALTER TABLE public.historical_monthly_tuition ADD COLUMN IF NOT EXISTS teacher_id_override uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

-- Link 박채원: 250000 (Jan) = 박채원_M (중등, 허민영), 190000 rows = 박채원_E (초등, 최윤기 via SST)
UPDATE public.historical_monthly_tuition SET student_id = '9d73009b-6fa4-4b79-92c6-f3b3d414cc88', teacher_id_override = '174b8c58-b196-4462-a871-84cff22bf470'
  WHERE student_name = '박채원' AND billed = 250000;
UPDATE public.historical_monthly_tuition SET student_id = '3d02ecac-a4e0-43ad-adab-318c283b8e6c'
  WHERE student_name = '박채원' AND billed = 190000;

-- 이승현: 큰 금액 = 이승현_H (고), 작은 금액(440000) = 이승현_M (중)
UPDATE public.historical_monthly_tuition SET student_id = '9544754b-773d-4390-a914-3461bd3fd821'
  WHERE student_name = '이승현' AND billed = 440000;
UPDATE public.historical_monthly_tuition SET student_id = '9109e301-fc7b-4e6b-b7ee-63d3d0710bdf'
  WHERE student_name = '이승현' AND billed <> 440000;
