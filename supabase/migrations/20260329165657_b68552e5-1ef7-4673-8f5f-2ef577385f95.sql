
CREATE TABLE public.attendance_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id),
  student_name text,
  room_id text CHECK (room_id IN ('room10','glass')),
  date date NOT NULL,
  checked_in_at timestamptz,
  checked_out_at timestamptz,
  assignment_id uuid REFERENCES public.room_assignments(id),
  recorded_by uuid REFERENCES public.profiles(id),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.room_capacities (
  room_id text PRIMARY KEY,
  capacity int NOT NULL DEFAULT 8,
  label text
);

INSERT INTO public.room_capacities VALUES
  ('room10', 8, '10강의실'),
  ('glass',  6, '유리문강의실');

ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_capacities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "all_read_attendance_logs" ON public.attendance_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth_insert_attendance_logs" ON public.attendance_logs FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth_update_attendance_logs" ON public.attendance_logs FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "all_read_room_capacities" ON public.room_capacities FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;
