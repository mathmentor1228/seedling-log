CREATE TABLE IF NOT EXISTS public.plan_planner_prints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  period_month text NOT NULL,            -- 'YYYY-MM'
  printed_at timestamptz NOT NULL DEFAULT now(),
  printed_by uuid,
  snapshot_updated_at timestamptz,       -- 출력 시점의 design.updated_at (이후 계획 수정 감지용)
  UNIQUE (design_id, period_month)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_planner_prints TO authenticated;
GRANT ALL ON public.plan_planner_prints TO service_role;
ALTER TABLE public.plan_planner_prints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON public.plan_planner_prints
FOR ALL TO authenticated USING (true) WITH CHECK (true);