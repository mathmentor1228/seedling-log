ALTER TABLE public.billing_schedules ADD COLUMN IF NOT EXISTS note text NULL;
COMMENT ON COLUMN public.billing_schedules.note IS 'owner free-text note for this month';