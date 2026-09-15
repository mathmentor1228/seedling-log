-- EXAM-CYCLES-V1: 내신대비 재설계 1주차
-- 1) 학원이 담당하는 학교 설정(academy_schools)  2) 시험 사이클 단일화(exam_cycles / exam_cycle_subjects)
-- 3) 학교 홈페이지 감시 로그(school_watch_log)  4) 학교명 표기 통일  5) 기존 school_exam_archives 일정 이관
-- 설계 노트: vault 17 — 내신대비 특강 재설계안 (2026-09-15)

-- ───────────────────────── 1. 학교 설정 ─────────────────────────
CREATE TABLE IF NOT EXISTS public.academy_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,                 -- 앱에서 쓰는 짧은 표기 (신길고)
  official_name text NOT NULL,               -- 나이스 정식명 (신길고등학교)
  aliases text[] NOT NULL DEFAULT '{}',      -- 같은 학교로 볼 표기들
  school_level text NOT NULL CHECK (school_level IN ('초','중','고')),
  neis_office_code text,                     -- 경기 = J10
  neis_school_code text,
  homepage_url text,
  boards jsonb NOT NULL DEFAULT '[]'::jsonb, -- [{name, url}] 시험 공지가 올라오는 게시판 목록
  grades int[] NOT NULL DEFAULT '{}',        -- 학원이 담당하는 학년
  subjects text[] NOT NULL DEFAULT '{}',     -- 학원이 담당하는 과목
  lead_weeks int NOT NULL DEFAULT 4,         -- 시험 며칠 전부터 대비 (주)
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ───────────────────────── 2. 시험 사이클 ─────────────────────────
CREATE TABLE IF NOT EXISTS public.exam_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.academy_schools(id) ON DELETE SET NULL,
  school_name text NOT NULL,
  school_level text NOT NULL,
  grade_year int NOT NULL,
  academic_year int NOT NULL,
  semester text NOT NULL,                    -- 1학기 / 2학기
  exam_type text NOT NULL,                   -- 중간고사 / 기말고사
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
  source text NOT NULL DEFAULT 'manual',     -- manual / archive / neis / homepage
  source_url text,
  confirmed_by uuid,
  confirmed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_name, grade_year, academic_year, semester, exam_type)
);

CREATE TABLE IF NOT EXISTS public.exam_cycle_subjects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.exam_cycles(id) ON DELETE CASCADE,
  subject text NOT NULL,
  exam_date date,
  period int,
  exam_time text,
  scope text,
  source text NOT NULL DEFAULT 'manual',
  source_url text,
  notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cycle_id, subject)
);

-- ───────────────────────── 3. 홈페이지 감시 로그 ─────────────────────────
CREATE TABLE IF NOT EXISTS public.school_watch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.academy_schools(id) ON DELETE CASCADE,
  school_name text NOT NULL,
  board_name text,
  post_key text NOT NULL,                    -- 게시판 URL + 글번호
  title text NOT NULL,
  posted_on date,
  post_url text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,  -- [{name, url}]
  matched_keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','extracted','applied','ignored')),
  extracted jsonb,                           -- AI 추출 결과 (2주차)
  cycle_id uuid REFERENCES public.exam_cycles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_key)
);

-- ───────────────────────── RLS ─────────────────────────
ALTER TABLE public.academy_schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_cycle_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_watch_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "staff read academy_schools" ON public.academy_schools FOR SELECT TO authenticated USING (true);
  CREATE POLICY "admin write academy_schools" ON public.academy_schools FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
  CREATE POLICY "staff read exam_cycles" ON public.exam_cycles FOR SELECT TO authenticated USING (true);
  CREATE POLICY "staff write exam_cycles" ON public.exam_cycles FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role));
  CREATE POLICY "staff read exam_cycle_subjects" ON public.exam_cycle_subjects FOR SELECT TO authenticated USING (true);
  CREATE POLICY "staff write exam_cycle_subjects" ON public.exam_cycle_subjects FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role))
    WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role));
  CREATE POLICY "staff read school_watch_log" ON public.school_watch_log FOR SELECT TO authenticated USING (true);
  CREATE POLICY "admin write school_watch_log" ON public.school_watch_log FOR ALL TO authenticated
    USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───────────────────────── 4. 학교 시드 (안산 6개교, 나이스 코드·게시판 실측 2026-09-15) ─────────────────────────
INSERT INTO public.academy_schools (name, official_name, aliases, school_level, neis_office_code, neis_school_code, homepage_url, boards, grades, subjects, lead_weeks) VALUES
('신길고', '신길고등학교', '{신길고등학교}', '고', 'J10', '7530886', 'https://singil-h.goeas.kr',
 '[{"name":"학교공지","url":"https://singil-h.goeas.kr/singil-h/na/ntt/selectNttList.do?mi=10291&bbsId=5234"},{"name":"가정통신문","url":"https://singil-h.goeas.kr/singil-h/na/ntt/selectNttList.do?mi=10471&bbsId=5349"}]',
 '{1,2,3}', '{수학,영어,국어,과학}', 4),
('신길중', '신길중학교', '{신길중학교}', '중', 'J10', '7611133', 'https://singil-m.goeas.kr',
 '[{"name":"학교소식","url":"https://singil-m.goeas.kr/singil-m/na/ntt/selectNttList.do?mi=6770&bbsId=3148"},{"name":"가정통신문","url":"https://singil-m.goeas.kr/singil-m/na/ntt/selectNttList.do?mi=6773&bbsId=3150"}]',
 '{1,2,3}', '{수학,영어,국어,과학}', 4),
('선부고', '선부고등학교', '{선부고등학교}', '고', 'J10', '7530887', 'https://seonbu-h.goeas.kr',
 '[{"name":"공지사항","url":"https://seonbu-h.goeas.kr/seonbu-h/na/ntt/selectNttList.do?mi=10507&bbsId=5367"}]',
 '{1,2,3}', '{수학,영어,국어,과학}', 4),
('원곡고', '원곡고등학교', '{원곡고등학교}', '고', 'J10', '7530105', 'https://wongok-h.goeas.kr',
 '[{"name":"공지사항","url":"https://wongok-h.goeas.kr/wongok-h/na/ntt/selectNttList.do?mi=12089&bbsId=6212"},{"name":"가정통신문","url":"https://wongok-h.goeas.kr/wongok-h/na/ntt/selectNttList.do?mi=12090&bbsId=6213"}]',
 '{1,2,3}', '{수학,영어,국어,과학}', 4),
('경일고', '경일고등학교', '{경일고등학교}', '고', 'J10', '7531618', 'https://kyongil-h.goeas.kr',
 '[{"name":"학교공지사항","url":"https://kyongil-h.goeas.kr/kyongil-h/na/ntt/selectNttList.do?mi=9830&bbsId=4958"},{"name":"가정통신문","url":"https://kyongil-h.goeas.kr/kyongil-h/na/ntt/selectNttList.do?mi=9997&bbsId=5058"}]',
 '{1,2,3}', '{수학,영어,국어,과학}', 4),
('신길초', '신길초등학교', '{신길초등학교}', '초', 'J10', '7611131', 'https://singil-e.goeas.kr',
 '[{"name":"공지사항","url":"https://singil-e.goeas.kr/singil-e/na/ntt/selectNttList.do?mi=2460&bbsId=786"}]',
 '{4,5,6}', '{수학,영어}', 3)
ON CONFLICT (name) DO NOTHING;

-- ───────────────────────── 5. 학교명 표기 통일 (별칭 → 짧은 표기) ─────────────────────────
UPDATE public.students s SET school = a.name FROM public.academy_schools a WHERE s.school = ANY(a.aliases);
UPDATE public.school_exam_archives t SET school_name = a.name FROM public.academy_schools a WHERE t.school_name = ANY(a.aliases);
UPDATE public.school_schedules t SET school_name = a.name FROM public.academy_schools a WHERE t.school_name = ANY(a.aliases);
UPDATE public.exam_prep_courses t SET school_name = a.name FROM public.academy_schools a WHERE t.school_name = ANY(a.aliases);

-- ───────────────────────── 6. 기존 시험 일정 이관 (원장이 입력한 것이므로 확정 상태) ─────────────────────────
INSERT INTO public.exam_cycles (school_id, school_name, school_level, grade_year, academic_year, semester, exam_type, start_date, end_date, status, source, confirmed_at)
SELECT a.id, r.school_name, r.school_level, r.grade_year, r.academic_year, r.semester, r.exam_type,
       MIN(r.exam_date_start), MAX(COALESCE(r.exam_date_end, r.exam_date_start)), 'confirmed', 'archive', now()
FROM public.school_exam_archives r
JOIN public.academy_schools a ON a.name = r.school_name
WHERE r.exam_type IN ('중간고사','기말고사') AND r.exam_date_start IS NOT NULL AND r.academic_year >= 2026
GROUP BY a.id, r.school_name, r.school_level, r.grade_year, r.academic_year, r.semester, r.exam_type
ON CONFLICT (school_name, grade_year, academic_year, semester, exam_type) DO NOTHING;

INSERT INTO public.exam_cycle_subjects (cycle_id, subject, exam_date, scope, source)
SELECT c.id, r.subject, NULL, NULLIF(r.exam_scope, ''), 'archive'
FROM public.school_exam_archives r
JOIN public.exam_cycles c ON c.school_name = r.school_name AND c.grade_year = r.grade_year AND c.academic_year = r.academic_year AND c.semester = r.semester AND c.exam_type = r.exam_type
WHERE r.exam_type IN ('중간고사','기말고사') AND r.academic_year >= 2026
ON CONFLICT (cycle_id, subject) DO NOTHING;

CREATE INDEX IF NOT EXISTS idx_exam_cycles_start ON public.exam_cycles (start_date);
CREATE INDEX IF NOT EXISTS idx_school_watch_log_status ON public.school_watch_log (status, created_at DESC);
