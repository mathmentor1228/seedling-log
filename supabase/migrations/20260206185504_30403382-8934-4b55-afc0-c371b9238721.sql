
-- Add share_token column for public report links
ALTER TABLE public.weekly_reports 
ADD COLUMN share_token TEXT UNIQUE;

-- Create index for fast token lookup
CREATE INDEX idx_weekly_reports_share_token ON public.weekly_reports(share_token) WHERE share_token IS NOT NULL;

-- Create a function to generate share tokens
CREATE OR REPLACE FUNCTION public.generate_share_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql SET search_path = public;
