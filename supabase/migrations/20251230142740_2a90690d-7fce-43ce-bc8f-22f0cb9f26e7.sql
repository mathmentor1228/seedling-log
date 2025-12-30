ALTER TABLE public.weekly_reports
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sent_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS sent_status TEXT CHECK (sent_status IN ('draft','sent','failed')) DEFAULT 'draft';