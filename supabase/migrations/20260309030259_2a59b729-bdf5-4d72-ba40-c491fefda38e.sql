ALTER TABLE public.textbook_distributions 
  ADD COLUMN IF NOT EXISTS message_sent_at timestamptz DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS message_resent_at timestamptz DEFAULT NULL;