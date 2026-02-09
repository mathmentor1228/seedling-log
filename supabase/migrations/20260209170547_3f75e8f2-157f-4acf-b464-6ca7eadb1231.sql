-- Add total_days column to vocab_settings to cap day numbers
ALTER TABLE public.vocab_settings ADD COLUMN total_days integer DEFAULT NULL;

COMMENT ON COLUMN public.vocab_settings.total_days IS 'Total number of days in the book. Schedule generation stops when this is exceeded.';
