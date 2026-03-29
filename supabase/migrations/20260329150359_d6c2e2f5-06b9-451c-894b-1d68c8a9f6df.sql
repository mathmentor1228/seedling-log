
ALTER TABLE public.room_assignments
  ADD COLUMN IF NOT EXISTS student_ids jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS student_names jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS span integer NOT NULL DEFAULT 1;

-- Make student_id nullable since we now use student_ids jsonb
ALTER TABLE public.room_assignments
  ALTER COLUMN student_id DROP NOT NULL;

-- Make teacher_id nullable
ALTER TABLE public.room_assignments
  ALTER COLUMN teacher_id DROP NOT NULL;
