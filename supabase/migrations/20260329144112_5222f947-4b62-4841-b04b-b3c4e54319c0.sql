
-- Table 1: room_assignments
CREATE TABLE public.room_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room text NOT NULL,
  assigned_date date NOT NULL,
  slot_start time NOT NULL,
  slot_end time NOT NULL,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  subject text,
  memo text,
  is_routine boolean NOT NULL DEFAULT false,
  routine_days jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage room_assignments"
ON public.room_assignments FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
  AND role IN ('admin','teacher','assistant')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
  AND role IN ('admin','teacher','assistant')
));

CREATE INDEX idx_room_assignments_date_room
  ON public.room_assignments(assigned_date, room);

CREATE INDEX idx_room_assignments_student
  ON public.room_assignments(student_id, assigned_date);

-- Table 2: room_slot_copies
CREATE TABLE public.room_slot_copies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_date date NOT NULL,
  target_date date NOT NULL,
  room text NOT NULL,
  copied_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.room_slot_copies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage room_slot_copies"
ON public.room_slot_copies FOR ALL TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
  AND role IN ('admin','teacher','assistant')
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.user_roles
  WHERE user_id = auth.uid()
  AND role IN ('admin','teacher','assistant')
));
