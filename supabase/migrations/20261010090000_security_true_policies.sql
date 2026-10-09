-- SECURITY-TRUE-POLICIES-V1 (2026-10-10)
-- Lovable 보안 스캔 critical 48건 수리: 47건 = 조건이 'true'인 RLS 정책, 1건 = storage school-documents 읽기 정책.
-- 원칙
--  1) 로그인한 "직원"(user_roles에 행이 있는 admin/teacher/assistant)만 통과하도록 true → public.is_staff() 로 바꾼다.
--     학생 앱·학부모 포털은 service role 함수를 거치므로 영향 없다.
--  2) 공개 페이지가 직접 쓰는 정책은 조건을 좁히되 살려 둔다
--     - exam_analysis_report_views INSERT(anon): 공개된 리포트의 조회 기록만 허용
--     - autonomous_study_surveys INSERT(anon): 그대로 (스캔 미지적) / SELECT는 admin·teacher만 (전화번호)
--     - system_announcements · report_templates · intensive_applications: 스캔 미지적 → 건드리지 않음
--  3) school_* 자료 6종 DELETE: 관리자 또는 올린 사람만
--  4) profiles SELECT: 직원만 (동료 이메일은 직원 간에는 보이는 것으로 허용 — 전 화면이 full_name 조회에 의존)
-- 되돌리기: 이 파일의 ALTER POLICY 들은 조건만 바꾸므로, 문제 시 해당 정책을 USING (true)로 되돌리면 된다.

-- ── 0. 헬퍼 함수 ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_teacher()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role);
$$;

REVOKE ALL ON FUNCTION public.is_staff() FROM public;
GRANT EXECUTE ON FUNCTION public.is_staff() TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_admin_or_teacher() FROM public;
GRANT EXECUTE ON FUNCTION public.is_admin_or_teacher() TO anon, authenticated, service_role;

-- ── 1. 일괄: 조건이 'true'인 정책 → is_staff() ────────────────────
-- 제외: 공개 페이지가 직접 쓰거나 스캔이 지적하지 않은 테이블 (아래 2·3에서 개별 처리)
DO $$
DECLARE
  p record;
  excluded text[] := ARRAY['autonomous_study_surveys', 'exam_analysis_report_views', 'system_announcements', 'report_templates', 'intensive_applications'];
  n int := 0;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname, cmd, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND NOT (tablename = ANY (excluded))
      AND (qual = 'true' OR with_check = 'true')
  LOOP
    IF p.cmd IN ('SELECT', 'DELETE') THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I USING (public.is_staff())', p.policyname, p.schemaname, p.tablename);
    ELSIF p.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (public.is_staff())', p.policyname, p.schemaname, p.tablename);
    ELSE -- UPDATE / ALL
      IF p.qual = 'true' AND (p.with_check IS NULL OR p.with_check = 'true') THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (public.is_staff()) WITH CHECK (public.is_staff())', p.policyname, p.schemaname, p.tablename);
      ELSIF p.qual = 'true' THEN
        EXECUTE format('ALTER POLICY %I ON %I.%I USING (public.is_staff())', p.policyname, p.schemaname, p.tablename);
      ELSE
        EXECUTE format('ALTER POLICY %I ON %I.%I WITH CHECK (public.is_staff())', p.policyname, p.schemaname, p.tablename);
      END IF;
    END IF;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'true-policies rewritten: %', n;
END $$;

-- ── 2. 개별: 공개 페이지가 쓰는 정책은 조건을 좁혀 유지 ───────────
-- 2-a. 리포트 조회 기록 (학부모 포털·학생 앱이 anon으로 INSERT): 공개된 리포트에 대해서만
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='exam_analysis_report_views' AND cmd='INSERT' AND with_check='true'
  LOOP
    EXECUTE format($f$ALTER POLICY %I ON public.exam_analysis_report_views WITH CHECK (
      EXISTS (SELECT 1 FROM public.exam_analysis_reports r
              WHERE r.id = report_id AND r.is_published = true AND (r.published_at IS NULL OR r.published_at <= now()))
    )$f$, p.policyname);
  END LOOP;
END $$;

-- 2-b. 자습 설문: anon INSERT는 유지(공개 설문 페이지), 응답(전화번호) 읽기는 admin·teacher만
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='autonomous_study_surveys' AND qual='true'
  LOOP
    IF p.cmd IN ('SELECT','DELETE') THEN
      EXECUTE format('ALTER POLICY %I ON public.autonomous_study_surveys USING (public.is_admin_or_teacher())', p.policyname);
    ELSIF p.cmd IN ('UPDATE','ALL') THEN
      EXECUTE format('ALTER POLICY %I ON public.autonomous_study_surveys USING (public.is_admin_or_teacher()) WITH CHECK (public.is_admin_or_teacher())', p.policyname);
    END IF;
  END LOOP;
END $$;

-- ── 3. 개별: 학교 자료 6종 DELETE는 관리자 또는 올린 사람만 ─────────
DO $$
DECLARE
  t record;
  p record;
  owner_col text;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('school_exam_archives','created_by'), ('school_textbooks','created_by'), ('school_schedules','created_by'), ('school_files','created_by'),
      ('school_exam_materials','uploaded_by'), ('school_calendar_images','uploaded_by')
    ) AS v(tbl, col)
  LOOP
    -- 컬럼이 실제로 있을 때만 소유자 조건을 붙인다
    SELECT column_name INTO owner_col FROM information_schema.columns WHERE table_schema='public' AND table_name=t.tbl AND column_name=t.col;
    FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename=t.tbl AND cmd='DELETE'
    LOOP
      IF owner_col IS NOT NULL THEN
        EXECUTE format('ALTER POLICY %I ON public.%I USING (public.is_admin_staff() OR %I = auth.uid())', p.policyname, t.tbl, owner_col);
      ELSE
        EXECUTE format('ALTER POLICY %I ON public.%I USING (public.is_admin_or_teacher())', p.policyname, t.tbl);
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- ── 4. storage: school-documents 버킷은 직원만 ───────────────────
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname ILIKE '%school-documents%'
  LOOP
    IF p.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON storage.objects WITH CHECK (bucket_id = ''school-documents'' AND public.is_staff())', p.policyname);
    ELSIF p.cmd IN ('SELECT','DELETE') THEN
      EXECUTE format('ALTER POLICY %I ON storage.objects USING (bucket_id = ''school-documents'' AND public.is_staff())', p.policyname);
    ELSE
      EXECUTE format('ALTER POLICY %I ON storage.objects USING (bucket_id = ''school-documents'' AND public.is_staff()) WITH CHECK (bucket_id = ''school-documents'' AND public.is_staff())', p.policyname);
    END IF;
  END LOOP;
END $$;

-- ── 5. 검증용 (결과는 NOTICE로) ───────────────────────────────────
DO $$
DECLARE remaining int; anon_true int;
BEGIN
  SELECT count(*) INTO remaining FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true');
  SELECT count(*) INTO anon_true FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true') AND (roles::text ILIKE '%anon%' OR roles::text ILIKE '%public%');
  RAISE NOTICE 'remaining true-policies in public: % (expected: autonomous_study_surveys INSERT, report_templates, system_announcements only) / anon-facing: %', remaining, anon_true;
END $$;
