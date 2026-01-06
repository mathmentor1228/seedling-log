-- A) Create teacher_student_links table
CREATE TABLE public.teacher_student_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(teacher_id, student_id)
);

-- B) Create trigger function to auto-create links on lesson_records insert/update
CREATE OR REPLACE FUNCTION public.upsert_teacher_student_link()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create link when record is submitted
  IF NEW.submitted = true THEN
    INSERT INTO public.teacher_student_links (teacher_id, student_id)
    VALUES (NEW.teacher_id, NEW.student_id)
    ON CONFLICT (teacher_id, student_id)
    DO UPDATE SET last_seen_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on lesson_records
CREATE TRIGGER trigger_upsert_teacher_student_link
AFTER INSERT OR UPDATE ON public.lesson_records
FOR EACH ROW
EXECUTE FUNCTION public.upsert_teacher_student_link();

-- C) Enable RLS on teacher_student_links
ALTER TABLE public.teacher_student_links ENABLE ROW LEVEL SECURITY;

-- Admin: full CRUD
CREATE POLICY "Admins can do all on teacher_student_links"
ON public.teacher_student_links
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Teacher: SELECT own links only
CREATE POLICY "Teachers can view own links"
ON public.teacher_student_links
FOR SELECT
USING (teacher_id = auth.uid());

-- Assistant: SELECT all (optional)
CREATE POLICY "Assistants can view teacher_student_links"
ON public.teacher_student_links
FOR SELECT
USING (has_role(auth.uid(), 'assistant'::app_role));

-- D) Add new SELECT policy for lesson_records - teachers can read submitted records for linked students
CREATE POLICY "Teachers can view submitted records for linked students"
ON public.lesson_records
FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND submitted = true
  AND EXISTS (
    SELECT 1 FROM public.teacher_student_links tsl
    WHERE tsl.teacher_id = auth.uid()
      AND tsl.student_id = lesson_records.student_id
  )
);

-- E) Backfill existing relationships from lesson_records
INSERT INTO public.teacher_student_links (teacher_id, student_id, first_seen_at, last_seen_at)
SELECT DISTINCT 
  teacher_id, 
  student_id, 
  MIN(created_at) as first_seen_at,
  MAX(updated_at) as last_seen_at
FROM public.lesson_records
WHERE submitted = true
GROUP BY teacher_id, student_id
ON CONFLICT (teacher_id, student_id) DO NOTHING;