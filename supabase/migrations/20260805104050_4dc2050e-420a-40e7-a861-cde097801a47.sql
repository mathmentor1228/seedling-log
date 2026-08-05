ALTER TABLE public.plan_goal_progress DROP CONSTRAINT IF EXISTS plan_goal_progress_status_check;
ALTER TABLE public.plan_goal_progress ADD CONSTRAINT plan_goal_progress_status_check
  CHECK (status IN ('planned','advanced','partial','verified_ok','verified_weak','skipped_absent','deferred','skipped'));