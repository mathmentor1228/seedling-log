ALTER POLICY "staff read exam_cycle_participants" ON public.exam_cycle_participants USING (public.is_staff());
ALTER POLICY "staff read student_action_notes" ON public.student_action_notes USING (public.is_staff());
ALTER POLICY "staff read exam_result_items" ON public.exam_result_items USING (public.is_staff());
ALTER POLICY "staff read exam_wrong_reason_tags" ON public.exam_wrong_reason_tags USING (public.is_staff());
ALTER POLICY "staff read exam_student_analyses" ON public.exam_student_analyses USING (public.is_staff());