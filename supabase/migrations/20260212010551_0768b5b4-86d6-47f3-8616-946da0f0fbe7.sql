ALTER TABLE public.vocab_settings
ADD COLUMN days_per_test_map jsonb DEFAULT NULL;

COMMENT ON COLUMN public.vocab_settings.days_per_test_map IS 'Per-day DAY count map, e.g. {"mon": 2, "wed": 3}. When set, overrides days_per_test.';