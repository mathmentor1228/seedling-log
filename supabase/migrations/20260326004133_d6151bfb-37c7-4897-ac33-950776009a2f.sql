
-- Allow all teachers to SELECT all exam prep courses (shared scheduling)
DROP POLICY IF EXISTS "Teachers can manage own courses" ON public.exam_prep_courses;
CREATE POLICY "Teachers can view all courses" ON public.exam_prep_courses FOR SELECT TO public USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Teachers can insert own courses" ON public.exam_prep_courses FOR INSERT TO public WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "Teachers can update own courses" ON public.exam_prep_courses FOR UPDATE TO public USING (teacher_id = auth.uid()) WITH CHECK (teacher_id = auth.uid());
CREATE POLICY "Teachers can delete own courses" ON public.exam_prep_courses FOR DELETE TO public USING (teacher_id = auth.uid());

-- Allow all teachers to SELECT all exam prep sessions
DROP POLICY IF EXISTS "Teachers can manage sessions of own courses" ON public.exam_prep_sessions;
CREATE POLICY "Teachers can view all sessions" ON public.exam_prep_sessions FOR SELECT TO public USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Teachers can insert own sessions" ON public.exam_prep_sessions FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_sessions.course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Teachers can update own sessions" ON public.exam_prep_sessions FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_sessions.course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Teachers can delete own sessions" ON public.exam_prep_sessions FOR DELETE TO public USING (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_sessions.course_id AND c.teacher_id = auth.uid()));

-- Allow all teachers to SELECT all exam prep enrollments
DROP POLICY IF EXISTS "Teachers can manage enrollments of own courses" ON public.exam_prep_enrollments;
CREATE POLICY "Teachers can view all enrollments" ON public.exam_prep_enrollments FOR SELECT TO public USING (has_role(auth.uid(), 'teacher'::app_role));
CREATE POLICY "Teachers can insert own enrollments" ON public.exam_prep_enrollments FOR INSERT TO public WITH CHECK (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_enrollments.course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Teachers can update own enrollments" ON public.exam_prep_enrollments FOR UPDATE TO public USING (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_enrollments.course_id AND c.teacher_id = auth.uid()));
CREATE POLICY "Teachers can delete own enrollments" ON public.exam_prep_enrollments FOR DELETE TO public USING (EXISTS (SELECT 1 FROM public.exam_prep_courses c WHERE c.id = exam_prep_enrollments.course_id AND c.teacher_id = auth.uid()));

-- Allow all teachers to SELECT all exam prep notifications
DROP POLICY IF EXISTS "Teachers can view own notifications" ON public.exam_prep_notifications;
CREATE POLICY "Teachers can view all notifications" ON public.exam_prep_notifications FOR SELECT TO public USING (has_role(auth.uid(), 'teacher'::app_role));
