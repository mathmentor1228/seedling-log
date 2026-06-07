
CREATE TABLE public.school_exam_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid REFERENCES public.school_schedules(id) ON DELETE SET NULL,
  school_name text NOT NULL,
  year integer NOT NULL,
  exam_period text,
  grade integer,
  subject text,
  subject_category text,
  scope text,
  note text,
  urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.school_exam_notes TO authenticated;
GRANT ALL ON public.school_exam_notes TO service_role;

ALTER TABLE public.school_exam_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth read exam notes" ON public.school_exam_notes
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert exam notes" ON public.school_exam_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "author update own notes" ON public.school_exam_notes
  FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "author or admin delete notes" ON public.school_exam_notes
  FOR DELETE TO authenticated USING (auth.uid() = author_id OR public.has_role(auth.uid(), 'admin'));

CREATE INDEX idx_exam_notes_school_year ON public.school_exam_notes(school_name, year);
CREATE INDEX idx_exam_notes_schedule ON public.school_exam_notes(schedule_id);
CREATE INDEX idx_exam_notes_subject ON public.school_exam_notes(subject_category, subject);

CREATE TRIGGER trg_exam_notes_updated_at
  BEFORE UPDATE ON public.school_exam_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
