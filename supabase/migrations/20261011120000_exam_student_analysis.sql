-- EXAM-STUDENT-ANALYSIS-V1 (2026-10-11, vault 19 §11·§14) — C단계: 학생별 시험 분석 송출
-- 흐름: 틀린 문항 표시 → 틀린 이유 태그(과목별 사전) → AI 기본 방향 초안 → 담당 교사 컨펌 → 원장 컨펌(=즉시 공개) → 학부모웹
-- 원칙: AI는 기록에 있는 사실(점수·변동·틀린 문항·태그·문항 난도)만 다듬는다. "학원이 어떻게 대응하는지"는 사람이 쓰는 칸(academy_action_text)이며
--       이 칸이 비면 공개할 수 없다. 호칭은 '아이'.

-- 1) 과목별 틀린 이유 태그 사전 (관리자 설정에서 수정 가능)
CREATE TABLE IF NOT EXISTS public.exam_wrong_reason_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL,            -- 수학·영어·국어·과학·공통
  code text NOT NULL,
  label text NOT NULL,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  UNIQUE (subject, code)
);
INSERT INTO public.exam_wrong_reason_tags (subject, code, label, sort_order) VALUES
  ('수학','calc','계산 실수',1),('수학','concept','개념 이해 부족',2),('수학','reading','조건·문제 해석 오류',3),('수학','setup','식 세우기 실패',4),('수학','time','시간 부족',5),('수학','unlearned','미학습 범위',6),
  ('영어','vocab','어휘',1),('영어','grammar','어법(문법)',2),('영어','reading','독해(내용 파악)',3),('영어','memorize','본문 암기 부족',4),('영어','writing','서술형 표기 실수',5),('영어','time','시간 부족',6),
  ('국어','reading','지문 독해',1),('국어','concept','개념(문법·문학 용어)',2),('국어','apply','보기 적용',3),('국어','choice','선지 판단 실수',4),('국어','time','시간 부족',5),('국어','unlearned','미학습 작품',6),
  ('과학','concept','개념 이해 부족',1),('과학','calc','계산 실수',2),('과학','data','자료(그래프·표) 해석',3),('과학','experiment','실험 과정 이해',4),('과학','term','용어 암기',5),('과학','time','시간 부족',6),
  ('공통','other','기타(메모)',99)
ON CONFLICT (subject, code) DO NOTHING;

-- 2) 틀린 문항 (결과 1건 × 문항 번호)
CREATE TABLE IF NOT EXISTS public.exam_result_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL REFERENCES public.student_exam_results(id) ON DELETE CASCADE,
  item_number int NOT NULL CHECK (item_number BETWEEN 1 AND 60),
  is_wrong boolean NOT NULL DEFAULT true,
  reason_tags text[] NOT NULL DEFAULT '{}',   -- exam_wrong_reason_tags.code 목록
  memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (result_id, item_number)
);
CREATE INDEX IF NOT EXISTS exam_result_items_result_idx ON public.exam_result_items(result_id);

-- 3) 학생별 분석 문안 + 컨펌 단계
CREATE TABLE IF NOT EXISTS public.exam_student_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id uuid NOT NULL UNIQUE REFERENCES public.student_exam_results(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  subject text NOT NULL,
  exam_year int,
  exam_period text,
  total_items int,                               -- 문항 수 (분석지가 있으면 거기서, 없으면 입력)
  wrong_count int NOT NULL DEFAULT 0,
  ai_draft text,                                 -- AI 초안 (기록 사실만)
  final_text text,                               -- 교사가 다듬은 최종 문안 (학부모에게 나가는 글)
  academy_action_text text,                      -- 학원의 대응 — 사람이 쓴다. 비면 공개 불가
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','teacher_confirmed','published')),
  teacher_confirmed_by uuid, teacher_confirmed_at timestamptz,
  principal_confirmed_by uuid, principal_confirmed_at timestamptz,
  published_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS exam_student_analyses_student_idx ON public.exam_student_analyses(student_id, status);

ALTER TABLE public.exam_wrong_reason_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_result_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_student_analyses ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "staff read exam_wrong_reason_tags" ON public.exam_wrong_reason_tags FOR SELECT TO authenticated USING (true);
  CREATE POLICY "admin write exam_wrong_reason_tags" ON public.exam_wrong_reason_tags FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
  CREATE POLICY "staff read exam_result_items" ON public.exam_result_items FOR SELECT TO authenticated USING (true);
  CREATE POLICY "staff write exam_result_items" ON public.exam_result_items FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role));
  CREATE POLICY "staff read exam_student_analyses" ON public.exam_student_analyses FOR SELECT TO authenticated USING (true);
  CREATE POLICY "staff write exam_student_analyses" ON public.exam_student_analyses FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 공개(published)는 원장만: 트리거로 강제 (교사는 teacher_confirmed까지)
CREATE OR REPLACE FUNCTION public.guard_exam_student_analysis_publish()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status = 'published' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'published') THEN
    IF NOT public.has_role(auth.uid(), 'admin'::app_role) THEN
      RAISE EXCEPTION 'PRINCIPAL_ONLY_PUBLISH';
    END IF;
    IF NEW.academy_action_text IS NULL OR length(btrim(NEW.academy_action_text)) < 5 THEN
      RAISE EXCEPTION 'ACADEMY_ACTION_REQUIRED';
    END IF;
    IF NEW.final_text IS NULL OR length(btrim(NEW.final_text)) < 20 THEN
      RAISE EXCEPTION 'FINAL_TEXT_REQUIRED';
    END IF;
    NEW.principal_confirmed_by := COALESCE(NEW.principal_confirmed_by, auth.uid());
    NEW.principal_confirmed_at := COALESCE(NEW.principal_confirmed_at, now());
    NEW.published_at := COALESCE(NEW.published_at, now());
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_guard_exam_student_analysis_publish ON public.exam_student_analyses;
CREATE TRIGGER trg_guard_exam_student_analysis_publish
  BEFORE INSERT OR UPDATE ON public.exam_student_analyses
  FOR EACH ROW EXECUTE FUNCTION public.guard_exam_student_analysis_publish();

CREATE OR REPLACE FUNCTION public.touch_exam_result_items() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_touch_exam_result_items ON public.exam_result_items;
CREATE TRIGGER trg_touch_exam_result_items BEFORE UPDATE ON public.exam_result_items FOR EACH ROW EXECUTE FUNCTION public.touch_exam_result_items();

COMMENT ON TABLE public.exam_student_analyses IS 'EXAM-STUDENT-ANALYSIS-V1: 학생별 시험 분석 문안. draft→teacher_confirmed→published(원장만, academy_action_text 필수).';
