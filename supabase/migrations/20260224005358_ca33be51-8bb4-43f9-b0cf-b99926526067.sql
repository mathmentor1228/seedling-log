
-- Table to track teacher acknowledgements on notice events
CREATE TABLE public.event_acks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.academy_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  user_name TEXT NOT NULL,
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.event_acks ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view acks
CREATE POLICY "Authenticated can view event_acks"
  ON public.event_acks FOR SELECT
  USING (true);

-- Users can insert their own ack
CREATE POLICY "Users can insert own ack"
  ON public.event_acks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can delete acks
CREATE POLICY "Admins can delete event_acks"
  ON public.event_acks FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));
