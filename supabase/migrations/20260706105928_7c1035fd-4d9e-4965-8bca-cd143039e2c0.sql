-- PLAN-ROSTER-MID-JOIN-V1: 중도 합류 학생의 시작 목표 지원
ALTER TABLE public.plan_students
  ADD COLUMN IF NOT EXISTS start_goal_id uuid REFERENCES public.plan_goals(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS joined_at date;

CREATE UNIQUE INDEX IF NOT EXISTS plan_students_design_student_uq
  ON public.plan_students(design_id, student_id);