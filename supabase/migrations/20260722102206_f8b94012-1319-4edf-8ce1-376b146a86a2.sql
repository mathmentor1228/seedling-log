
ALTER TABLE public.intensive_applications
  ADD COLUMN IF NOT EXISTS student_id uuid REFERENCES public.students(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fee integer NOT NULL DEFAULT 250000,
  ADD COLUMN IF NOT EXISTS billed_month text,
  ADD COLUMN IF NOT EXISTS billed_at timestamptz;

ALTER TABLE public.billing_schedules
  ADD COLUMN IF NOT EXISTS extra_amount numeric(10,0) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS extra_memo text;
