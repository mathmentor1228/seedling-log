CREATE TABLE IF NOT EXISTS public.plan_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  subject text NOT NULL,
  textbook text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.plan_tracks(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  title text NOT NULL,
  pages text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_goals_track ON public.plan_goals(track_id, order_index);

CREATE TABLE IF NOT EXISTS public.plan_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.plan_tracks(id),
  class_id uuid,
  teacher_id uuid NOT NULL,
  title text NOT NULL,
  teaching_mode text NOT NULL DEFAULT 'lecture' CHECK (teaching_mode IN ('lecture','abc','individual')),
  type_concepts jsonb NOT NULL DEFAULT '{}',
  angle_mode text NOT NULL DEFAULT 'manual' CHECK (angle_mode IN ('manual','ai','off')),
  check_methods jsonb NOT NULL DEFAULT '[]',
  check_cycle text NOT NULL DEFAULT 'every',
  cutline_default int NOT NULL DEFAULT 70,
  cutline_by_type jsonb NOT NULL DEFAULT '{}',
  fail_action text NOT NULL DEFAULT 'retest' CHECK (fail_action IN ('retest','clinic','homework')),
  escalate_after int NOT NULL DEFAULT 2,
  rhythm jsonb NOT NULL DEFAULT '{}',
  end_goal_id uuid REFERENCES public.plan_goals(id),
  target_date date,
  pace_alert_sessions numeric NOT NULL DEFAULT 2,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  student_type text CHECK (student_type IN ('A','B','C')),
  custom_end_goal_id uuid REFERENCES public.plan_goals(id),
  custom_target_date date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, student_id)
);

CREATE TABLE IF NOT EXISTS public.plan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  role text NOT NULL DEFAULT 'progress' CHECK (role IN ('progress','progress_quiz','test_day')),
  note text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved')),
  saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, session_date)
);

CREATE TABLE IF NOT EXISTS public.plan_goal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.plan_goals(id),
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','advanced','partial','verified_ok','verified_weak','skipped_absent','deferred')),
  partial_upto text,
  session_id uuid REFERENCES public.plan_sessions(id),
  advanced_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, student_id, goal_id)
);
CREATE INDEX IF NOT EXISTS idx_pgp_student ON public.plan_goal_progress(design_id, student_id);

CREATE TABLE IF NOT EXISTS public.plan_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.plan_sessions(id),
  student_id uuid NOT NULL,
  goal_id uuid REFERENCES public.plan_goals(id),
  method text NOT NULL DEFAULT 'quiz' CHECK (method IN ('quiz','homework','oral','unit_test','retest')),
  score numeric,
  cutline int,
  passed boolean,
  error_type text CHECK (error_type IN ('concept','mistake','time')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_checks_student ON public.plan_checks(design_id, student_id, created_at);

CREATE TABLE IF NOT EXISTS public.plan_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  goal_id uuid REFERENCES public.plan_goals(id),
  source_check_id uuid REFERENCES public.plan_checks(id),
  kind text NOT NULL CHECK (kind IN ('retest','relearn','makeup')),
  title text NOT NULL,
  assignee text NOT NULL DEFAULT 'teacher' CHECK (assignee IN ('teacher','assistant')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','done','cancelled')),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_queue_open ON public.plan_queue(design_id, status);

CREATE TABLE IF NOT EXISTS public.plan_teacher_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.plan_sessions(id),
  content text NOT NULL,
  shown boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.plan_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pace','level')),
  level text NOT NULL DEFAULT 'teacher' CHECK (level IN ('teacher','principal')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.plan_student_retros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  design_id uuid REFERENCES public.plan_designs(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  understanding int CHECK (understanding BETWEEN 1 AND 5),
  stuck_note text,
  change_note text,
  teacher_reply text,
  replied_by uuid,
  replied_at timestamptz,
  points_awarded int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, week_start)
);

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'plan_tracks','plan_goals','plan_designs','plan_students','plan_sessions',
    'plan_goal_progress','plan_checks','plan_queue','plan_teacher_memos',
    'plan_flags','plan_student_retros'
  ] LOOP
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "Staff full access" ON public.%I', t);
    EXECUTE format('CREATE POLICY "Staff full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;