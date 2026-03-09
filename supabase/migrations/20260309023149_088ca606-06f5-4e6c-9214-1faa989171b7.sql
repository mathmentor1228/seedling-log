ALTER TABLE public.textbook_distributions 
  ADD COLUMN IF NOT EXISTS billed_at timestamp with time zone DEFAULT NULL;