-- STUDENT-ACTION-NOTES-V1 (2026-10-10, vault 19 §19-2)
-- 목적: "이 시험 뒤에 학원이 무엇을 했는가"를 원장·선생님이 직접 적는 조치 메모.
--       학생 기록 화면(기록·학생 모드)의 '학원의 조치' 타임라인에 특강·클리닉·주간 코멘트와 함께 표시되고, 상담 자료로 쓰인다.
CREATE TABLE IF NOT EXISTS public.student_action_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject text,                       -- NULL = 전 과목/원장 메모
  note_date date NOT NULL DEFAULT (now() AT TIME ZONE 'Asia/Seoul')::date,
  text text NOT NULL CHECK (length(btrim(text)) >= 2),
  created_by uuid,
  created_by_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS student_action_notes_student_idx ON public.student_action_notes(student_id, note_date DESC);

ALTER TABLE public.student_action_notes ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "staff read student_action_notes" ON public.student_action_notes FOR SELECT TO authenticated USING (true);
  CREATE POLICY "staff insert student_action_notes" ON public.student_action_notes FOR INSERT TO authenticated
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role));
  CREATE POLICY "own or admin update student_action_notes" ON public.student_action_notes FOR UPDATE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());
  CREATE POLICY "own or admin delete student_action_notes" ON public.student_action_notes FOR DELETE TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.touch_student_action_notes() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_touch_student_action_notes ON public.student_action_notes;
CREATE TRIGGER trg_touch_student_action_notes BEFORE UPDATE ON public.student_action_notes
  FOR EACH ROW EXECUTE FUNCTION public.touch_student_action_notes();

COMMENT ON TABLE public.student_action_notes IS 'STUDENT-ACTION-NOTES-V1: 학생별 학원 조치 메모(원장·강사 직접 작성). 기록·학생 모드 타임라인·상담 자료.';
