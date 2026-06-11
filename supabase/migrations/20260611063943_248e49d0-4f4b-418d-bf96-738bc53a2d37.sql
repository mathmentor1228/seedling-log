
-- Add columns to private_messages for richer workflow
ALTER TABLE public.private_messages
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'directive',
  ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.private_messages(id) ON DELETE CASCADE;

DO $$ BEGIN
  ALTER TABLE public.private_messages
    ADD CONSTRAINT private_messages_kind_check CHECK (kind IN ('directive','question','reply'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.private_messages
    ADD CONSTRAINT private_messages_priority_check CHECK (priority IN ('low','normal','high','urgent'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_private_messages_parent ON public.private_messages(parent_id);

-- Allow authenticated users to view colleague profiles (internal staff app)
DROP POLICY IF EXISTS "Authenticated users can view colleague profiles" ON public.profiles;
CREATE POLICY "Authenticated users can view colleague profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Assign 영어 subject to 최수린
UPDATE public.profiles SET assigned_subject = '영어'
  WHERE email = 'assistanteng99@gmail.com';
