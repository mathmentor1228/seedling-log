-- Create homework_assignments table
CREATE TABLE public.homework_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  subject public.subject_type NOT NULL,
  lesson_record_id uuid REFERENCES public.lesson_records(id) ON DELETE SET NULL,
  assigned_date date NOT NULL DEFAULT CURRENT_DATE,
  content text NOT NULL,
  check_status text NOT NULL DEFAULT 'unchecked' CHECK (check_status IN ('unchecked', 'checked')),
  result text CHECK (result IN ('completed', 'partial', 'not_done', 'unable_to_verify')),
  checked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  checked_at timestamptz,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.homework_assignments ENABLE ROW LEVEL SECURITY;

-- Admin can do all
CREATE POLICY "Admins can do all on homework_assignments"
ON public.homework_assignments
FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

-- Teachers can view homework assignments
CREATE POLICY "Teachers can view homework_assignments"
ON public.homework_assignments
FOR SELECT
USING (public.has_role(auth.uid(), 'teacher'));

-- Teachers can insert homework assignments
CREATE POLICY "Teachers can insert homework_assignments"
ON public.homework_assignments
FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'teacher'));

-- Teachers can update check_status, result, notes, checked_by, checked_at
CREATE POLICY "Teachers can update homework_assignments"
ON public.homework_assignments
FOR UPDATE
USING (public.has_role(auth.uid(), 'teacher'));

-- Create index for faster lookups by student + subject
CREATE INDEX idx_homework_student_subject ON public.homework_assignments(student_id, subject, assigned_date DESC, created_at DESC);