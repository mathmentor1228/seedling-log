-- Create class_schedules table with all required columns and constraints
CREATE TABLE public.class_schedules (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  class_id uuid NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL,
  day_of_week int NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- Constraint: end_time must be after start_time
  CONSTRAINT valid_time_range CHECK (end_time > start_time),
  
  -- Unique constraint: no duplicate slots per teacher/day/start_time
  CONSTRAINT unique_teacher_slot UNIQUE (teacher_id, day_of_week, start_time)
);

-- Enable RLS
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;

-- Admin can do all
CREATE POLICY "Admins can do all on class_schedules"
ON public.class_schedules
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Teachers can view their own schedules
CREATE POLICY "Teachers can view own schedules"
ON public.class_schedules
FOR SELECT
USING (teacher_id = auth.uid());

-- Teachers can insert their own schedules
CREATE POLICY "Teachers can insert own schedules"
ON public.class_schedules
FOR INSERT
WITH CHECK (teacher_id = auth.uid());

-- Teachers can update their own schedules
CREATE POLICY "Teachers can update own schedules"
ON public.class_schedules
FOR UPDATE
USING (teacher_id = auth.uid());

-- Teachers can delete their own schedules
CREATE POLICY "Teachers can delete own schedules"
ON public.class_schedules
FOR DELETE
USING (teacher_id = auth.uid());

-- Trigger for updated_at
CREATE TRIGGER update_class_schedules_updated_at
BEFORE UPDATE ON public.class_schedules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();