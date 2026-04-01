ALTER TABLE public.vocab_settings 
ADD COLUMN IF NOT EXISTS test_time_limit integer DEFAULT NULL,
ADD COLUMN IF NOT EXISTS test_level integer DEFAULT 1;