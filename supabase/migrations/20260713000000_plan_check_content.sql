-- PLAN-QUIZ-CONTENT-V1: 쪽지·단원테스트의 실제 내용(범위)을 필요 시 기록.
-- quizTarget 자동 추정(마지막 나간 목표)이 실제 시험 범위와 다를 때 교사가 보정해 적는 칸.
ALTER TABLE public.plan_checks ADD COLUMN IF NOT EXISTS content_note text;
