ALTER TABLE public.room_assignments
  ADD COLUMN IF NOT EXISTS day text,
  ADD COLUMN IF NOT EXISTS is_fixed boolean NOT NULL DEFAULT false;

ALTER TABLE public.room_assignments
  ALTER COLUMN assigned_date DROP NOT NULL;