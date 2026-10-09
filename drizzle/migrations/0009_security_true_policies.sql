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
    ELSE
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

DO $$
DECLARE remaining int; anon_true int;
BEGIN
  SELECT count(*) INTO remaining FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true');
  SELECT count(*) INTO anon_true FROM pg_policies WHERE schemaname='public' AND (qual='true' OR with_check='true') AND (roles::text ILIKE '%anon%' OR roles::text ILIKE '%public%');
  RAISE NOTICE 'remaining true-policies in public: % / anon-facing: %', remaining, anon_true;
END $$;