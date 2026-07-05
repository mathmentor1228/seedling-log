
-- Intensives (special add-on sessions like winter camp) + Co-teacher assignments
CREATE TABLE IF NOT EXISTS public.plan_intensives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  added_sessions int NOT NULL DEFAULT 0,
  rhythm jsonb NOT NULL DEFAULT '{}'::jsonb,
  scope text NOT NULL DEFAULT 'all',
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_intensives TO authenticated;
GRANT ALL ON public.plan_intensives TO service_role;
ALTER TABLE public.plan_intensives ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON public.plan_intensives FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.plan_intensive_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intensive_id uuid NOT NULL REFERENCES public.plan_intensives(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  UNIQUE (intensive_id, student_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_intensive_students TO authenticated;
GRANT ALL ON public.plan_intensive_students TO service_role;
ALTER TABLE public.plan_intensive_students ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON public.plan_intensive_students FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS public.plan_co_teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  role_note text,
  status text NOT NULL DEFAULT 'active',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.plan_co_teachers TO authenticated;
GRANT ALL ON public.plan_co_teachers TO service_role;
ALTER TABLE public.plan_co_teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON public.plan_co_teachers FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add per-session overrides
ALTER TABLE public.plan_sessions
  ADD COLUMN IF NOT EXISTS intensive_id uuid REFERENCES public.plan_intensives(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assigned_teacher_id uuid,
  ADD COLUMN IF NOT EXISTS goal_id uuid REFERENCES public.plan_goals(id) ON DELETE SET NULL;
