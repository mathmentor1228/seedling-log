ALTER TABLE public.vocab_schedules ADD COLUMN test_time time without time zone;
ALTER TABLE public.vocab_test_results ADD COLUMN retest_time time without time zone;