-- 1) team note attachments/replies: mirror team_notes visibility
DROP POLICY IF EXISTS "Users can view attachments on visible notes" ON public.team_note_attachments;
DROP POLICY IF EXISTS "Users can insert attachments on visible notes" ON public.team_note_attachments;
DROP POLICY IF EXISTS "Users can view replies on visible notes" ON public.team_note_replies;
DROP POLICY IF EXISTS "Users can insert replies on visible notes" ON public.team_note_replies;

CREATE POLICY "Users can view attachments on visible notes"
ON public.team_note_attachments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.team_notes tn
  WHERE tn.id = team_note_attachments.note_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR tn.created_by = auth.uid()
      OR tn.target_user_id = auth.uid()
      OR (tn.target_role IS NOT NULL AND (
            (tn.target_role = 'teacher' AND has_role(auth.uid(), 'teacher'::app_role))
         OR (tn.target_role = 'assistant' AND has_role(auth.uid(), 'assistant'::app_role))))
      OR (tn.target_role IS NULL AND tn.target_user_id IS NULL)
    )
));

CREATE POLICY "Users can insert attachments on visible notes"
ON public.team_note_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.team_notes tn
  WHERE tn.id = team_note_attachments.note_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR tn.created_by = auth.uid()
      OR tn.target_user_id = auth.uid()
      OR (tn.target_role IS NOT NULL AND (
            (tn.target_role = 'teacher' AND has_role(auth.uid(), 'teacher'::app_role))
         OR (tn.target_role = 'assistant' AND has_role(auth.uid(), 'assistant'::app_role))))
      OR (tn.target_role IS NULL AND tn.target_user_id IS NULL)
    )
));

CREATE POLICY "Users can view replies on visible notes"
ON public.team_note_replies FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.team_notes tn
  WHERE tn.id = team_note_replies.note_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR tn.created_by = auth.uid()
      OR tn.target_user_id = auth.uid()
      OR (tn.target_role IS NOT NULL AND (
            (tn.target_role = 'teacher' AND has_role(auth.uid(), 'teacher'::app_role))
         OR (tn.target_role = 'assistant' AND has_role(auth.uid(), 'assistant'::app_role))))
      OR (tn.target_role IS NULL AND tn.target_user_id IS NULL)
    )
));

CREATE POLICY "Users can insert replies on visible notes"
ON public.team_note_replies FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND EXISTS (
  SELECT 1 FROM public.team_notes tn
  WHERE tn.id = team_note_replies.note_id
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR tn.created_by = auth.uid()
      OR tn.target_user_id = auth.uid()
      OR (tn.target_role IS NOT NULL AND (
            (tn.target_role = 'teacher' AND has_role(auth.uid(), 'teacher'::app_role))
         OR (tn.target_role = 'assistant' AND has_role(auth.uid(), 'assistant'::app_role))))
      OR (tn.target_role IS NULL AND tn.target_user_id IS NULL)
    )
));

-- 2) security definer view -> invoker + drop anon access
ALTER VIEW public.overdue_lesson_drafts SET (security_invoker = true);
REVOKE ALL ON public.overdue_lesson_drafts FROM anon;
GRANT SELECT ON public.overdue_lesson_drafts TO authenticated, service_role;