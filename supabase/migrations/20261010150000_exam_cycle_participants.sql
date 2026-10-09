-- EXAM-PARTICIPANTS-V1 (2026-10-10)
-- 목적: 사이클(학교×학년×학기×시험)별로 "이 학생이 이번 시험을 보는가"를 기록한다.
-- 배경: 재원 중이지만 이번 시험을 안 보는 학생(자퇴·검정고시·전학 준비·장기 결석 등)에게
--       시험 일정·특강 스케줄을 보내지 않고, 결과표 '미입력'에서도 빼기 위해 (원장 요청 2026-10-10).
-- 행이 없으면 '응시'로 본다. 화면은 애매한 학생(최근 21일 수업 없음·수강 과목 연결 없음·직전 시험 미응시)을
-- 위에서 한 번 더 물어 원장/선생님이 확정한다.

CREATE TABLE IF NOT EXISTS public.exam_cycle_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.exam_cycles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('taking', 'not_taking')),
  reason text,
  decided_by uuid,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, student_id)
);

CREATE INDEX IF NOT EXISTS exam_cycle_participants_student_idx ON public.exam_cycle_participants(student_id);

ALTER TABLE public.exam_cycle_participants ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "staff read exam_cycle_participants" ON public.exam_cycle_participants
    FOR SELECT TO authenticated USING (true);
  CREATE POLICY "staff write exam_cycle_participants" ON public.exam_cycle_participants
    FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_exam_cycle_participants()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_touch_exam_cycle_participants ON public.exam_cycle_participants;
CREATE TRIGGER trg_touch_exam_cycle_participants
  BEFORE UPDATE ON public.exam_cycle_participants
  FOR EACH ROW EXECUTE FUNCTION public.touch_exam_cycle_participants();

COMMENT ON TABLE public.exam_cycle_participants IS 'EXAM-PARTICIPANTS-V1: 사이클별 학생 응시 여부. 행 없음 = 응시. not_taking 이면 일정·특강·결과표 대상에서 제외.';
