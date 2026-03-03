
-- Table to track when a user last read replies on their team notes
CREATE TABLE public.team_note_reply_reads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  note_id uuid NOT NULL REFERENCES public.team_notes(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, note_id)
);

ALTER TABLE public.team_note_reply_reads ENABLE ROW LEVEL SECURITY;

-- Users can manage their own read records
CREATE POLICY "Users can manage own reply reads"
ON public.team_note_reply_reads
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
