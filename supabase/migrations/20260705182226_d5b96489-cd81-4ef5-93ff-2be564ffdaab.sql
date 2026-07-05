
ALTER FUNCTION public.format_student_grade_label(text, integer) SET search_path = public;
ALTER FUNCTION public.generate_vocab_test_token() SET search_path = public;
ALTER FUNCTION public.grade_at_year(text, integer) SET search_path = public;
ALTER FUNCTION public.validate_school_file_fields() SET search_path = public;
ALTER FUNCTION public.validate_school_schedule_type() SET search_path = public;
ALTER FUNCTION public.validate_student_exam_result() SET search_path = public;
ALTER FUNCTION public.validate_vocab_generated_tests_columns() SET search_path = public;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef = true
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM PUBLIC, anon;', r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role;', r.proname, r.args);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION public.get_published_analysis_for_parent_token(text) TO anon;

DROP POLICY IF EXISTS "Authenticated users can view billing_schedules" ON public.billing_schedules;
CREATE POLICY "Staff can view billing_schedules"
  ON public.billing_schedules FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'assistant'::app_role));

DROP POLICY IF EXISTS "Authenticated users can view payment_records" ON public.payment_records;
CREATE POLICY "Staff can view payment_records"
  ON public.payment_records FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'assistant'::app_role));

DROP POLICY IF EXISTS "Allow public read on congestion_predictions" ON public.congestion_predictions;
DROP POLICY IF EXISTS "Allow service insert on congestion_predictions" ON public.congestion_predictions;
DROP POLICY IF EXISTS "Allow service update on congestion_predictions" ON public.congestion_predictions;
CREATE POLICY "Authenticated can read congestion_predictions"
  ON public.congestion_predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin can insert congestion_predictions"
  ON public.congestion_predictions FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Admin can update congestion_predictions"
  ON public.congestion_predictions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "auth all" ON public.exam_student_self_checks;
CREATE POLICY "Staff can manage exam_student_self_checks"
  ON public.exam_student_self_checks FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'assistant'::app_role));

DROP POLICY IF EXISTS "Staff full access" ON public.plan_planner_prints;
CREATE POLICY "Staff can manage plan_planner_prints"
  ON public.plan_planner_prints FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'assistant'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'assistant'::app_role));

DROP POLICY IF EXISTS "Anyone can view homework submission images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view homework submissions files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload homework submissions files" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete own homework submissions files" ON storage.objects;
CREATE POLICY "Authenticated can view homework submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'homework-submissions');
CREATE POLICY "Staff can upload homework submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'homework-submissions' AND (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'teacher'::app_role) OR public.has_role(auth.uid(), 'assistant'::app_role)));

DROP POLICY IF EXISTS "Public read vocab-submissions" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload vocab-submissions" ON storage.objects;
CREATE POLICY "Authenticated can view vocab-submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'vocab-submissions');
CREATE POLICY "Authenticated can upload vocab-submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vocab-submissions');

DROP POLICY IF EXISTS "Anyone can view math question photos" ON storage.objects;
CREATE POLICY "Authenticated can view math question photos"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'math-questions');

DROP POLICY IF EXISTS "Anyone can view quiz submission images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read quiz submissions" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can upload quiz submissions" ON storage.objects;
CREATE POLICY "Authenticated can view quiz submissions"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'quiz-submissions');
CREATE POLICY "Authenticated can upload quiz submissions"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quiz-submissions');
