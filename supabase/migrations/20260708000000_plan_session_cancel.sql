-- PLAN-CANCEL-V1: 휴강 처리 — 세션 상태에 'cancelled' 추가 + 휴강 사유 컬럼
ALTER TABLE public.plan_sessions DROP CONSTRAINT IF EXISTS plan_sessions_status_check;
ALTER TABLE public.plan_sessions ADD CONSTRAINT plan_sessions_status_check
  CHECK (status IN ('draft','saved','cancelled'));
ALTER TABLE public.plan_sessions ADD COLUMN IF NOT EXISTS cancel_reason text;
