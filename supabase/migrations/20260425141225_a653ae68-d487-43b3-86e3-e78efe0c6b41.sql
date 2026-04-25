ALTER TABLE public.exam_analysis_reports
  ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS locked_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS locked_by_name text,
  ADD COLUMN IF NOT EXISTS locked_at timestamptz;