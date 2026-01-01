-- Create holidays table
CREATE TABLE public.holidays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holiday_date date NOT NULL,
  name text NOT NULL,
  scope text NOT NULL DEFAULT 'all' CHECK (scope IN ('all', 'teacher')),
  teacher_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  CONSTRAINT holidays_teacher_scope_check CHECK (
    (scope = 'all' AND teacher_id IS NULL) OR
    (scope = 'teacher' AND teacher_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.holidays ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can do all on holidays"
ON public.holidays FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view holidays"
ON public.holidays FOR SELECT
USING (has_role(auth.uid(), 'teacher'));

CREATE POLICY "Assistants can view holidays"
ON public.holidays FOR SELECT
USING (has_role(auth.uid(), 'assistant'));

-- Index for efficient lookups
CREATE INDEX idx_holidays_date ON public.holidays(holiday_date);
CREATE INDEX idx_holidays_teacher ON public.holidays(teacher_id) WHERE teacher_id IS NOT NULL;