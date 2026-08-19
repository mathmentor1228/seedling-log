CREATE OR REPLACE FUNCTION public.can_view_team_note(_note_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_notes tn
    WHERE tn.id = _note_id
      AND (
        has_role(auth.uid(), 'admin'::app_role)
        OR tn.created_by = auth.uid()
        OR tn.target_user_id = auth.uid()
        OR (tn.target_role IS NOT NULL AND (
              (tn.target_role = 'teacher' AND has_role(auth.uid(), 'teacher'::app_role))
           OR (tn.target_role = 'assistant' AND has_role(auth.uid(), 'assistant'::app_role))
        ))
        OR (tn.target_role IS NULL AND tn.target_user_id IS NULL)
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_team_note(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.can_view_team_note(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS "Users can view attachments on visible notes" ON public.team_note_attachments;
CREATE POLICY "Users can view attachments on visible notes"
ON public.team_note_attachments FOR SELECT TO authenticated
USING (public.can_view_team_note(note_id));

DROP POLICY IF EXISTS "Users can insert attachments on visible notes" ON public.team_note_attachments;
CREATE POLICY "Users can insert attachments on visible notes"
ON public.team_note_attachments FOR INSERT TO authenticated
WITH CHECK (uploaded_by = auth.uid() AND public.can_view_team_note(note_id));

DROP POLICY IF EXISTS "Users can view replies on visible notes" ON public.team_note_replies;
CREATE POLICY "Users can view replies on visible notes"
ON public.team_note_replies FOR SELECT TO authenticated
USING (public.can_view_team_note(note_id));

DROP POLICY IF EXISTS "Users can insert replies on visible notes" ON public.team_note_replies;
CREATE POLICY "Users can insert replies on visible notes"
ON public.team_note_replies FOR INSERT TO authenticated
WITH CHECK (created_by = auth.uid() AND public.can_view_team_note(note_id));