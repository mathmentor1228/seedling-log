
-- Add parent_token column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS parent_token TEXT UNIQUE;

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_students_parent_token ON public.students(parent_token) WHERE parent_token IS NOT NULL;

-- Function to generate parent token
CREATE OR REPLACE FUNCTION public.generate_parent_token()
RETURNS TEXT AS $$
BEGIN
  RETURN encode(extensions.gen_random_bytes(16), 'hex');
END;
$$ LANGUAGE plpgsql SET search_path = public;
