-- ADMIN_BRIEFING_V2: Daily briefings and weekly principal reports

-- Table: daily_briefings (stores daily summary data)
CREATE TABLE public.daily_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_date date NOT NULL UNIQUE,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  highlights jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.daily_briefings ENABLE ROW LEVEL SECURITY;

-- Only admins can manage daily_briefings
CREATE POLICY "Admins can do all on daily_briefings"
  ON public.daily_briefings FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Table: weekly_principal_reports (stores weekly roll-up summaries)
CREATE TABLE public.weekly_principal_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL UNIQUE,
  week_end date NOT NULL,
  summary_text text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  teacher_breakdown jsonb NOT NULL DEFAULT '[]'::jsonb,
  attention_students jsonb NOT NULL DEFAULT '[]'::jsonb,
  recurring_issues jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  generated_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.weekly_principal_reports ENABLE ROW LEVEL SECURITY;

-- Only admins can manage weekly_principal_reports
CREATE POLICY "Admins can do all on weekly_principal_reports"
  ON public.weekly_principal_reports FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- Create indexes for faster lookups
CREATE INDEX idx_daily_briefings_date ON public.daily_briefings(briefing_date);
CREATE INDEX idx_weekly_principal_reports_week ON public.weekly_principal_reports(week_start);