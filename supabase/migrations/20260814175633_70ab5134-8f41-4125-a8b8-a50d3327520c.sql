ALTER TABLE public.system_announcements
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'internal';

ALTER TABLE public.system_announcements
  DROP CONSTRAINT IF EXISTS system_announcements_visibility_check;

ALTER TABLE public.system_announcements
  ADD CONSTRAINT system_announcements_visibility_check
  CHECK (visibility IN ('internal', 'public'));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.system_announcements TO authenticated;
GRANT ALL ON public.system_announcements TO service_role;
GRANT SELECT ON public.system_announcements TO anon;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE policyname = 'Anon users can read public active announcements'
      AND tablename = 'system_announcements'
  ) THEN
    CREATE POLICY "Anon users can read public active announcements"
    ON public.system_announcements
    FOR SELECT
    TO anon
    USING (
      is_active = true
      AND visibility = 'public'
      AND (expires_at IS NULL OR expires_at > now())
    );
  END IF;
END
$$;