ALTER TABLE public.student_accounts
ADD COLUMN IF NOT EXISTS session_token text,
ADD COLUMN IF NOT EXISTS session_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_student_accounts_session_token
ON public.student_accounts(session_token)
WHERE session_token IS NOT NULL;