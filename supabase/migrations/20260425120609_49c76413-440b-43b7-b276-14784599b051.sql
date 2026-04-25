ALTER TABLE public.test_records
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.self_study_records
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.clinic_records
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;

ALTER TABLE public.lesson_records
  ADD COLUMN IF NOT EXISTS confirmed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS confirmed_by_name text,
  ADD COLUMN IF NOT EXISTS confirmed_at timestamptz;