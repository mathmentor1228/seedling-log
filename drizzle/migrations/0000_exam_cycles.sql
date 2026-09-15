-- EXAM-CYCLES-V1
CREATE TABLE IF NOT EXISTS public.academy_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  official_name text NOT NULL,
  aliases text[] NOT NULL DEFAULT '{}',
  school_level text NOT NULL CHECK (school_level IN ('초','중','고')),
  neis_office_code text,
  neis_school_code text,
  homepage_url text,
  boards jsonb NOT NULL DEFAULT '[]'::jsonb,
  grades int[] NOT NULL DEFAULT '{}',
  subjects text[] NOT NULL DEFAULT '{}',
  lead_weeks int NOT NULL DEFAULT 4,
  is_active boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.exam_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.academy_schools(id) ON DELETE SET NULL,
  school_name text NOT NULL,
  school_level text NOT NULL,
  grade_year int NOT NULL,
  academic_year int NOT NULL,
  semester text NOT NULL,
  exam_type text NOT NULL,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
  source text NOT NULL DEFAULT 'manual',
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

CREATE TABLE IF NOT EXISTS public.school_watch_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES public.academy_schools(id) ON DELETE CASCADE,
  school_name text NOT NULL,
  board_name text,
  post_key text NOT NULL,
  title text NOT NULL,
  posted_on date,
  post_url text,
  attachments jsonb NOT NULL DEFAULT '[]'::jsonb,
  matched_keywords text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','extracted','applied','ignored')),
  extracted jsonb,
  cycle_id uuid REFERENCES public.exam_cycles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.academy_schools TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_cycles TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_cycle_subjects TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_watch_log TO authenticated;
GRANT ALL ON public.academy_schools TO service_role;
GRANT ALL ON public.exam_cycles TO service_role;
GRANT ALL ON public.exam_cycle_subjects TO service_role;
GRANT ALL ON public.school_watch_log TO service_role;

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

UPDATE public.students s SET school = a.name FROM public.academy_schools a WHERE s.school = ANY(a.aliases);
UPDATE public.school_exam_archives t SET school_name = a.name FROM public.academy_schools a WHERE t.school_name = ANY(a.aliases);
UPDATE public.school_schedules t SET school_name = a.name FROM public.academy_schools a WHERE t.school_name = ANY(a.aliases);
UPDATE public.exam_prep_courses t SET school_name = a.name FROM public.academy_schools a WHERE t.school_name = ANY(a.aliases);

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