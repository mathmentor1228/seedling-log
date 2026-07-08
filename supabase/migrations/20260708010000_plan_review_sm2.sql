-- PLAN-REVIEW-SM2-V1: 망각곡선 복습 스케줄 — 확인(✓이해) 시 다음 복습일 자동 세팅
-- 사다리: 3일 → 7일 → 14일 → 30일 → 60일 / 미흡·실패 시 3일로 리셋
ALTER TABLE public.plan_goal_progress ADD COLUMN IF NOT EXISTS review_count int NOT NULL DEFAULT 0;
ALTER TABLE public.plan_goal_progress ADD COLUMN IF NOT EXISTS review_interval int;
ALTER TABLE public.plan_goal_progress ADD COLUMN IF NOT EXISTS next_review_date date;
CREATE INDEX IF NOT EXISTS idx_pgp_review_due
  ON public.plan_goal_progress(design_id, next_review_date)
  WHERE next_review_date IS NOT NULL;
