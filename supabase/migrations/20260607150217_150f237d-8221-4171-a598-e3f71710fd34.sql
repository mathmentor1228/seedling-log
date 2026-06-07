
CREATE TABLE IF NOT EXISTS public.prep_lecture_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_schedule_id uuid REFERENCES public.school_schedules(id) ON DELETE CASCADE,
  school_name text NOT NULL,
  grade_year int,
  school_level text,
  subject text NOT NULL,
  teacher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_ids uuid[] NOT NULL DEFAULT '{}',
  exam_title text,
  exam_date date NOT NULL,
  target_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  confirmed_course_id uuid REFERENCES public.exam_prep_courses(id) ON DELETE SET NULL,
  selected_start_time time,
  selected_end_time time,
  selected_classroom_id uuid REFERENCES public.classrooms(id) ON DELETE SET NULL,
  notify_students boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_schedule_id, subject, teacher_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.prep_lecture_proposals TO authenticated;
GRANT ALL ON public.prep_lecture_proposals TO service_role;

ALTER TABLE public.prep_lecture_proposals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access prep_lecture_proposals"
ON public.prep_lecture_proposals FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teacher sees own prep_lecture_proposals"
ON public.prep_lecture_proposals FOR SELECT TO authenticated
USING (teacher_id = auth.uid() OR teacher_id IS NULL);

CREATE POLICY "Teacher updates own prep_lecture_proposals"
ON public.prep_lecture_proposals FOR UPDATE TO authenticated
USING (teacher_id = auth.uid())
WITH CHECK (teacher_id = auth.uid());

CREATE POLICY "Assistant reads prep_lecture_proposals"
ON public.prep_lecture_proposals FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'assistant'));

CREATE INDEX IF NOT EXISTS idx_prep_lecture_proposals_teacher_status
  ON public.prep_lecture_proposals (teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_prep_lecture_proposals_target_date
  ON public.prep_lecture_proposals (target_date);

CREATE OR REPLACE FUNCTION public.touch_prep_lecture_proposals_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_touch_prep_lecture_proposals ON public.prep_lecture_proposals;
CREATE TRIGGER trg_touch_prep_lecture_proposals
BEFORE UPDATE ON public.prep_lecture_proposals
FOR EACH ROW EXECUTE FUNCTION public.touch_prep_lecture_proposals_updated_at();
