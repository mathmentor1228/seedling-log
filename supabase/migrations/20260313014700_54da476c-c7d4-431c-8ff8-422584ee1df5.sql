
-- Time slots within each exam prep session
CREATE TABLE public.exam_prep_time_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.exam_prep_sessions(id) ON DELETE CASCADE,
  start_time text NOT NULL,
  end_time text NOT NULL,
  slot_order int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Student assignments to specific time slots
CREATE TABLE public.exam_prep_slot_students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.exam_prep_time_slots(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(slot_id, student_id)
);

ALTER TABLE public.exam_prep_time_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exam_prep_slot_students ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can manage time_slots" ON public.exam_prep_time_slots FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can manage slot_students" ON public.exam_prep_slot_students FOR ALL TO authenticated USING (true) WITH CHECK (true);
