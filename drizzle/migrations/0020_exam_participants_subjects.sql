ALTER TABLE public.exam_cycle_participants ADD COLUMN IF NOT EXISTS not_taking_subjects text[] NOT NULL DEFAULT '{}';
COMMENT ON COLUMN public.exam_cycle_participants.not_taking_subjects IS '응시는 하지만 이 과목들은 응시/대비하지 않음 (과목별 응시 확인)';
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_cycle_participants TO authenticated;
GRANT ALL ON public.exam_cycle_participants TO service_role;