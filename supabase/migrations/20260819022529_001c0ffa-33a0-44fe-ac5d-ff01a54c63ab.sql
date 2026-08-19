DROP POLICY IF EXISTS "Users can view attachments on visible notes" ON public.team_note_attachments;
CREATE POLICY "Users can view attachments on visible notes"
ON public.team_note_attachments FOR SELECT
USING (EXISTS (SELECT 1 FROM public.team_notes tn WHERE tn.id = team_note_attachments.note_id));

DROP POLICY IF EXISTS "Users can insert attachments on visible notes" ON public.team_note_attachments;
CREATE POLICY "Users can insert attachments on visible notes"
ON public.team_note_attachments FOR INSERT
WITH CHECK (uploaded_by = auth.uid() AND EXISTS (SELECT 1 FROM public.team_notes tn WHERE tn.id = team_note_attachments.note_id));

DROP POLICY IF EXISTS "Users can view replies on visible notes" ON public.team_note_replies;
CREATE POLICY "Users can view replies on visible notes"
ON public.team_note_replies FOR SELECT
USING (EXISTS (SELECT 1 FROM public.team_notes tn WHERE tn.id = team_note_replies.note_id));

DROP POLICY IF EXISTS "Users can insert replies on visible notes" ON public.team_note_replies;
CREATE POLICY "Users can insert replies on visible notes"
ON public.team_note_replies FOR INSERT
WITH CHECK (EXISTS (SELECT 1 FROM public.team_notes tn WHERE tn.id = team_note_replies.note_id));

DROP FUNCTION IF EXISTS public.can_view_team_note(uuid);