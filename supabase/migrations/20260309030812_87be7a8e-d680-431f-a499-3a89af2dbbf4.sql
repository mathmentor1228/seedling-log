ALTER TABLE public.students ADD COLUMN IF NOT EXISTS parent_name text DEFAULT NULL;
ALTER TABLE public.textbook_distributions ADD COLUMN IF NOT EXISTS depositor_name text DEFAULT NULL;