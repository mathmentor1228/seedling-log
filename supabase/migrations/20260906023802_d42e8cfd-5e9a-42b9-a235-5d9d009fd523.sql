ALTER TABLE public.signup_events
  ADD COLUMN IF NOT EXISTS subject public.subject_type,
  ADD COLUMN IF NOT EXISTS teacher_id uuid REFERENCES public.profiles(id);

ALTER TABLE public.signup_slots
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.signup_entries
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz,
  ADD COLUMN IF NOT EXISTS lesson_record_id uuid REFERENCES public.lesson_records(id) ON DELETE SET NULL;