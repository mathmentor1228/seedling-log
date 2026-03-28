
-- Table 1: test_records
CREATE TABLE public.test_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  lesson_record_id uuid REFERENCES public.lesson_records(id) ON DELETE SET NULL,
  test_date date NOT NULL,
  start_time time,
  end_time time,
  subject text NOT NULL,
  test_type text NOT NULL DEFAULT 'guerrilla',
  content text NOT NULL,
  score text,
  passed boolean,
  assistant_name text,
  room text NOT NULL DEFAULT 'general',
  memo text,
  teacher_checked boolean NOT NULL DEFAULT false,
  teacher_checked_at timestamptz,
  teacher_check_memo text,
  assistant_confirmed boolean NOT NULL DEFAULT false,
  assistant_confirmed_at timestamptz,
  assistant_attendance boolean,
  assistant_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.test_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage test_records"
ON public.test_records FOR ALL TO authenticated
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

CREATE INDEX idx_test_records_student_date ON public.test_records(student_id, test_date);
CREATE INDEX idx_test_records_date_room ON public.test_records(test_date, room);
CREATE INDEX idx_test_records_teacher ON public.test_records(teacher_id, test_date);

-- Table 2: self_study_records
CREATE TABLE public.self_study_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  lesson_record_id uuid REFERENCES public.lesson_records(id) ON DELETE SET NULL,
  study_date date NOT NULL,
  subject text,
  task_list jsonb DEFAULT '[]'::jsonb,
  start_time time,
  end_time time,
  duration_minutes integer,
  room text NOT NULL DEFAULT 'general',
  memo text,
  teacher_checked boolean NOT NULL DEFAULT false,
  teacher_checked_at timestamptz,
  teacher_check_memo text,
  assistant_confirmed boolean NOT NULL DEFAULT false,
  assistant_confirmed_at timestamptz,
  assistant_attendance boolean,
  assistant_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.self_study_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage self_study_records"
ON public.self_study_records FOR ALL TO authenticated
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

CREATE INDEX idx_self_study_student_date ON public.self_study_records(student_id, study_date);
CREATE INDEX idx_self_study_date_room ON public.self_study_records(study_date, room);
CREATE INDEX idx_self_study_teacher ON public.self_study_records(teacher_id, study_date);

-- Table 3: clinic_records
CREATE TABLE public.clinic_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  lesson_record_id uuid REFERENCES public.lesson_records(id) ON DELETE SET NULL,
  clinic_date date NOT NULL,
  start_time time,
  end_time time,
  subject text NOT NULL,
  content text NOT NULL,
  next_clinic_memo text,
  teacher_note text,
  teacher_note_shown boolean NOT NULL DEFAULT false,
  room text NOT NULL DEFAULT 'general',
  teacher_checked boolean NOT NULL DEFAULT false,
  teacher_checked_at timestamptz,
  teacher_check_memo text,
  assistant_confirmed boolean NOT NULL DEFAULT false,
  assistant_confirmed_at timestamptz,
  assistant_attendance boolean,
  assistant_memo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.clinic_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage clinic_records"
ON public.clinic_records FOR ALL TO authenticated
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

CREATE INDEX idx_clinic_records_student_date ON public.clinic_records(student_id, clinic_date);
CREATE INDEX idx_clinic_records_date_room ON public.clinic_records(clinic_date, room);
CREATE INDEX idx_clinic_records_teacher ON public.clinic_records(teacher_id, clinic_date);
CREATE INDEX idx_clinic_note_shown ON public.clinic_records(teacher_note_shown) WHERE teacher_note IS NOT NULL;

-- Table 4: routine_schedules
CREATE TABLE public.routine_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  teacher_id uuid NOT NULL REFERENCES auth.users(id),
  day_of_week integer NOT NULL,
  start_time time,
  end_time time,
  student_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
  subject text,
  room text NOT NULL DEFAULT 'general',
  template_content text,
  assistant_name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.routine_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can manage routine_schedules"
ON public.routine_schedules FOR ALL TO authenticated
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
