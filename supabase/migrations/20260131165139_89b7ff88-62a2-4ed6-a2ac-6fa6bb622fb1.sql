-- Create operations changelog table for tracking teacher changes, class changes, etc.
-- Marker: OPS_CHANGELOG_V1

CREATE TABLE public.ops_changelog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  log_type TEXT NOT NULL DEFAULT 'general',  -- e.g. 'teacher_change', 'class_change', 'policy_change', 'general'
  target TEXT,                                -- e.g. '고등부 영어', '수학 클래스'
  content TEXT NOT NULL,                      -- detailed description
  author_name TEXT NOT NULL,                  -- who wrote this log
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ops_changelog ENABLE ROW LEVEL SECURITY;

-- Only admins can manage ops changelog
CREATE POLICY "Admins can do all on ops_changelog"
  ON public.ops_changelog
  FOR ALL
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Add index for date-based queries
CREATE INDEX idx_ops_changelog_log_date ON public.ops_changelog(log_date DESC);

-- Add comment for documentation
COMMENT ON TABLE public.ops_changelog IS 'OPS_CHANGELOG_V1: Tracks operational changes like teacher assignments, class reorganizations, policy updates';
