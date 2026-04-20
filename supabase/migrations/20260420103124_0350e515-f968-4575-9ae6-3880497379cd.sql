-- 1) Main results table
CREATE TABLE public.student_exam_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  school_name TEXT NOT NULL,
  subject TEXT NOT NULL,
  exam_type TEXT NOT NULL DEFAULT 'midterm', -- midterm | final | performance | other
  expected_score NUMERIC(5,2),
  note TEXT,
  exam_date DATE,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ser_student ON public.student_exam_results(student_id);
CREATE INDEX idx_ser_school ON public.student_exam_results(school_name);
CREATE INDEX idx_ser_submitted ON public.student_exam_results(submitted_at DESC);

-- 2) Photos table
CREATE TABLE public.student_exam_result_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  result_id UUID NOT NULL REFERENCES public.student_exam_results(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  original_name TEXT,
  mime_type TEXT,
  file_size BIGINT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_serp_result ON public.student_exam_result_photos(result_id);

-- 3) updated_at trigger
CREATE TRIGGER trg_ser_updated_at
BEFORE UPDATE ON public.student_exam_results
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Validate exam_type
CREATE OR REPLACE FUNCTION public.validate_student_exam_result()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.exam_type NOT IN ('midterm','final','performance','other') THEN
    RAISE EXCEPTION 'Invalid exam_type: %', NEW.exam_type;
  END IF;
  IF NEW.expected_score IS NOT NULL AND (NEW.expected_score < 0 OR NEW.expected_score > 100) THEN
    RAISE EXCEPTION 'expected_score must be between 0 and 100';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_ser_validate
BEFORE INSERT OR UPDATE ON public.student_exam_results
FOR EACH ROW EXECUTE FUNCTION public.validate_student_exam_result();

-- 5) RLS
ALTER TABLE public.student_exam_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_exam_result_photos ENABLE ROW LEVEL SECURITY;

-- Staff (admin/teacher/assistant) can read all
CREATE POLICY "Staff read all exam results"
ON public.student_exam_results FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'teacher') OR
  public.has_role(auth.uid(), 'assistant')
);

-- Staff can manage (for moderation/cleanup)
CREATE POLICY "Staff manage exam results"
ON public.student_exam_results FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'teacher') OR
  public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'teacher') OR
  public.has_role(auth.uid(), 'assistant')
);

-- Photos policies (mirror parent)
CREATE POLICY "Staff read all exam photos"
ON public.student_exam_result_photos FOR SELECT
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'teacher') OR
  public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff manage exam photos"
ON public.student_exam_result_photos FOR ALL
USING (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'teacher') OR
  public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR
  public.has_role(auth.uid(), 'teacher') OR
  public.has_role(auth.uid(), 'assistant')
);

-- NOTE: Student app uses a separate auth system (student-data edge function with service role),
-- so student-side reads/writes will be performed through an edge function, not direct RLS.

-- 6) Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('exam-results', 'exam-results', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for staff
CREATE POLICY "Staff read exam-results storage"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'exam-results' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  )
);

CREATE POLICY "Staff write exam-results storage"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'exam-results' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  )
);

CREATE POLICY "Staff delete exam-results storage"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'exam-results' AND (
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  )
);