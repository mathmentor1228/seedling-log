ALTER TABLE public.test_records
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS routine_id uuid REFERENCES public.routine_schedules(id);

CREATE INDEX IF NOT EXISTS idx_test_records_routine_id ON public.test_records(routine_id);
CREATE INDEX IF NOT EXISTS idx_test_records_source ON public.test_records(source);