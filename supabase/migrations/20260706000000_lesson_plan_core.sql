-- ═══════════════════════════════════════════════════════════════
-- LESSON-PLAN-CORE-V1 — 수업 계획안 학습코어 골조 (목업 v11 확정 스키마)
-- 원칙: 전부 신규 plan_* 테이블 (기존 테이블 무변경). 교직원 전체 접근,
-- 학생 접근은 추후 엣지 함수(service_role) 경유.
-- ═══════════════════════════════════════════════════════════════

-- 1. 트랙 — 순서 있는 목표 목록의 컨테이너 (교재 단위)
CREATE TABLE IF NOT EXISTS public.plan_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,                        -- 예: "중3-2 수학 (개념원리)"
  subject text NOT NULL,                      -- 수학/영어/국어/과학
  textbook text,                              -- 교재명
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. 목표 — 트랙의 한 항목 (반드시 페이지 명시)
CREATE TABLE IF NOT EXISTS public.plan_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.plan_tracks(id) ON DELETE CASCADE,
  order_index int NOT NULL,
  title text NOT NULL,                        -- 예: "원과 현 — 수직이등분선"
  pages text,                                 -- 예: "p.52–58"
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_goals_track ON public.plan_goals(track_id, order_index);

-- 3. 수업 설계 — 6문답의 답 (그룹×시즌 단위)
CREATE TABLE IF NOT EXISTS public.plan_designs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_id uuid NOT NULL REFERENCES public.plan_tracks(id),
  class_id uuid,                              -- 기존 classes 참조 (느슨한 연결)
  teacher_id uuid NOT NULL,
  title text NOT NULL,                        -- 예: "신길중3 수학 A그룹 — 2학기"
  -- Q2 수업 방향
  teaching_mode text NOT NULL DEFAULT 'lecture'
    CHECK (teaching_mode IN ('lecture','abc','individual')),
  type_concepts jsonb NOT NULL DEFAULT '{}',  -- {"A":"심화...","B":"표준...","C":"개념 보강..."}
  angle_mode text NOT NULL DEFAULT 'manual'
    CHECK (angle_mode IN ('manual','ai','off')),
  -- Q3 확인 룰셋
  check_methods jsonb NOT NULL DEFAULT '[]',  -- ["quiz","homework","oral","unit_test"]
  check_cycle text NOT NULL DEFAULT 'every',  -- every | every_plus_unit | weekly
  cutline_default int NOT NULL DEFAULT 70,
  cutline_by_type jsonb NOT NULL DEFAULT '{}',-- {"A":80,"B":70,"C":60}
  -- Q4 미달 관리
  fail_action text NOT NULL DEFAULT 'retest'
    CHECK (fail_action IN ('retest','clinic','homework')),
  escalate_after int NOT NULL DEFAULT 2,      -- N회 연속 미달 → 추가관리 플래그
  -- Q5 리듬·기한
  rhythm jsonb NOT NULL DEFAULT '{}',         -- {"mon":"progress","thu":"progress_quiz"} (test_day 포함)
  end_goal_id uuid REFERENCES public.plan_goals(id),
  target_date date,
  pace_alert_sessions numeric NOT NULL DEFAULT 2, -- 밀림 기준(회분) — 원장 조정 가능
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 4. 설계 참여 학생 — 유형 배정 + 개별 오버라이드(진도 리셋)
CREATE TABLE IF NOT EXISTS public.plan_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  student_type text CHECK (student_type IN ('A','B','C')),
  custom_end_goal_id uuid REFERENCES public.plan_goals(id),  -- 개별 끝점 (진도 리셋 시)
  custom_target_date date,                                    -- 개별 기한
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, student_id)
);

-- 5. 수업 세션 — 실행된 하루 (회차 역할 포함)
CREATE TABLE IF NOT EXISTS public.plan_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  role text NOT NULL DEFAULT 'progress' CHECK (role IN ('progress','progress_quiz','test_day')),
  note text,                                  -- 특이사항 한 줄
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','saved')),
  saved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, session_date)
);

-- 6. 목표 진행 — 학생×목표의 상태 (부분 진도 포함) ★핵심
CREATE TABLE IF NOT EXISTS public.plan_goal_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  goal_id uuid NOT NULL REFERENCES public.plan_goals(id),
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','advanced','partial','verified_ok','verified_weak','skipped_absent','deferred')),
  partial_upto text,                          -- "p.55" — 일부 진도 시 어디까지
  session_id uuid REFERENCES public.plan_sessions(id),
  advanced_at timestamptz,
  verified_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (design_id, student_id, goal_id)
);
CREATE INDEX IF NOT EXISTS idx_pgp_student ON public.plan_goal_progress(design_id, student_id);

-- 7. 확인 기록 — 쪽지시험·과제검사 등 (내용=목표 연결 + 오답유형 원탭) ★
CREATE TABLE IF NOT EXISTS public.plan_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.plan_sessions(id),
  student_id uuid NOT NULL,
  goal_id uuid REFERENCES public.plan_goals(id),  -- 무엇을 테스트했나 (내용 라벨의 원천)
  method text NOT NULL DEFAULT 'quiz' CHECK (method IN ('quiz','homework','oral','unit_test','retest')),
  score numeric,
  cutline int,
  passed boolean,
  error_type text CHECK (error_type IN ('concept','mistake','time')), -- 미달 시 원탭
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_plan_checks_student ON public.plan_checks(design_id, student_id, created_at);

-- 8. 추가할일큐 — 재시험·재학습·보충 (교사/조교 라우팅)
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

-- 9. 교사 포스트잇 — "다음 수업의 나에게"
CREATE TABLE IF NOT EXISTS public.plan_teacher_memos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.plan_sessions(id),
  content text NOT NULL,
  shown boolean NOT NULL DEFAULT false,        -- 다음 수업에서 표시됐는지
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 10. 플래그 — 진도격차/학습신호 에스컬레이션 (교사 → 원장)
CREATE TABLE IF NOT EXISTS public.plan_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  design_id uuid NOT NULL REFERENCES public.plan_designs(id) ON DELETE CASCADE,
  student_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('pace','level')),  -- 진도 밀림 / 학습 신호 지속 빨강
  level text NOT NULL DEFAULT 'teacher' CHECK (level IN ('teacher','principal')),
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

-- 11. 학생 회고 — 3줄 회고 + 교사 답장 + 포인트 연동
CREATE TABLE IF NOT EXISTS public.plan_student_retros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL,
  design_id uuid REFERENCES public.plan_designs(id) ON DELETE SET NULL,
  week_start date NOT NULL,
  understanding int CHECK (understanding BETWEEN 1 AND 5),
  stuck_note text,                            -- 막힌 것 하나
  change_note text,                           -- 다음 주 바꿀 것 하나
  teacher_reply text,                         -- 반드시 답장
  replied_by uuid,
  replied_at timestamptz,
  points_awarded int NOT NULL DEFAULT 0,      -- student_point_history 연동은 앱에서
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, week_start)
);

-- ── 권한: 교직원(authenticated) 전체 접근, service_role 전권 ──
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
    EXECUTE format(
      'DROP POLICY IF EXISTS "Staff full access" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "Staff full access" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t);
  END LOOP;
END $$;
