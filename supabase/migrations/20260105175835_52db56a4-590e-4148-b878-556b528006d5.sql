-- A) Create mapping table for student-subject-teacher authorization
CREATE TABLE public.student_subject_teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  subject TEXT NOT NULL CHECK (subject IN ('수학','과학','영어','국어')),
  teacher_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(student_id, subject, teacher_id)
);

-- Enable RLS
ALTER TABLE public.student_subject_teachers ENABLE ROW LEVEL SECURITY;

-- RLS policies for student_subject_teachers
-- Admin: full CRUD
CREATE POLICY "Admins can do all on student_subject_teachers"
ON public.student_subject_teachers
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Teacher: SELECT only their own mappings
CREATE POLICY "Teachers can view own subject mappings"
ON public.student_subject_teachers
FOR SELECT
USING (teacher_id = auth.uid());

-- Assistant: SELECT all (for lookup purposes)
CREATE POLICY "Assistants can view student_subject_teachers"
ON public.student_subject_teachers
FOR SELECT
USING (public.has_role(auth.uid(), 'assistant'));

-- B) Add SELECT policy for lesson_records: teachers can read submitted records via subject mapping
CREATE POLICY "Teachers can view submitted records for mapped students"
ON public.lesson_records
FOR SELECT
USING (
  public.has_role(auth.uid(), 'teacher'::app_role)
  AND submitted = true
  AND EXISTS (
    SELECT 1 FROM public.student_subject_teachers sst
    WHERE sst.student_id = lesson_records.student_id
      AND sst.subject::text = lesson_records.subject::text
      AND sst.teacher_id = auth.uid()
  )
);