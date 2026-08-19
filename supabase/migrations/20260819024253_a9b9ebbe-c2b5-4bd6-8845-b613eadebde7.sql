DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['plan_checks','plan_co_teachers','plan_designs','plan_flags','plan_goal_progress','plan_goals','plan_intensive_students','plan_intensives','plan_queue','plan_sessions','plan_student_retros','plan_students','plan_teacher_memos','plan_tracks','student_book_progress','student_book_progress_log']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Staff full access" ON public.%I', t);
    EXECUTE format($f$CREATE POLICY "Staff role full access" ON public.%I FOR ALL TO authenticated
      USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'teacher'::app_role) OR has_role(auth.uid(),'assistant'::app_role))
      WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'teacher'::app_role) OR has_role(auth.uid(),'assistant'::app_role))$f$, t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
  END LOOP;
END $$;