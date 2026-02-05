-- STUDENT-APP-V1: Database schema for student-facing homework submission app

-- 1. Add points column to students table
ALTER TABLE public.students 
ADD COLUMN IF NOT EXISTS total_points INTEGER DEFAULT 0;

-- 2. Add homework submission columns to homework_assignments table
-- (integrating with existing table instead of creating new one)
ALTER TABLE public.homework_assignments
ADD COLUMN IF NOT EXISTS submission_image_url TEXT,
ADD COLUMN IF NOT EXISTS submission_text TEXT,
ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS points_earned INTEGER DEFAULT 0;

-- 3. Create student_accounts table for student login (separate from auth.users)
-- Students use a PIN-based login with their student_code
CREATE TABLE IF NOT EXISTS public.student_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  pin_hash TEXT NOT NULL, -- 4-6 digit PIN hashed
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT unique_student_account UNIQUE (student_id)
);

-- 4. Create homework_submissions table for image/file uploads
CREATE TABLE IF NOT EXISTS public.homework_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  homework_id UUID NOT NULL REFERENCES public.homework_assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  image_url TEXT,
  submission_note TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID,
  points_awarded INTEGER DEFAULT 0,
  feedback TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'needs_revision')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Create student_point_history table to track point changes
CREATE TABLE IF NOT EXISTS public.student_point_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  related_homework_id UUID REFERENCES public.homework_assignments(id) ON DELETE SET NULL,
  related_submission_id UUID REFERENCES public.homework_submissions(id) ON DELETE SET NULL,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. Enable RLS on new tables
ALTER TABLE public.student_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.homework_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_point_history ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies for student_accounts
-- Admins can do all
CREATE POLICY "Admins can do all on student_accounts" ON public.student_accounts
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Assistants can view and update
CREATE POLICY "Assistants can view student_accounts" ON public.student_accounts
  FOR SELECT USING (has_role(auth.uid(), 'assistant'));

CREATE POLICY "Assistants can update student_accounts" ON public.student_accounts
  FOR UPDATE USING (has_role(auth.uid(), 'assistant'));

-- 8. RLS Policies for homework_submissions
-- Admins can do all
CREATE POLICY "Admins can do all on homework_submissions" ON public.homework_submissions
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Assistants can do all
CREATE POLICY "Assistants can do all on homework_submissions" ON public.homework_submissions
  FOR ALL USING (has_role(auth.uid(), 'assistant'));

-- Teachers can view submissions for their students
CREATE POLICY "Teachers can view homework_submissions" ON public.homework_submissions
  FOR SELECT USING (
    has_role(auth.uid(), 'teacher') AND 
    teacher_owns_student(auth.uid(), student_id)
  );

-- Teachers can update (review) submissions for their students
CREATE POLICY "Teachers can update homework_submissions" ON public.homework_submissions
  FOR UPDATE USING (
    has_role(auth.uid(), 'teacher') AND 
    teacher_owns_student(auth.uid(), student_id)
  );

-- 9. RLS Policies for student_point_history
-- Admins can do all
CREATE POLICY "Admins can do all on student_point_history" ON public.student_point_history
  FOR ALL USING (has_role(auth.uid(), 'admin'));

-- Assistants can view
CREATE POLICY "Assistants can view student_point_history" ON public.student_point_history
  FOR SELECT USING (has_role(auth.uid(), 'assistant'));

-- Teachers can view their students' point history
CREATE POLICY "Teachers can view student_point_history" ON public.student_point_history
  FOR SELECT USING (
    has_role(auth.uid(), 'teacher') AND 
    teacher_owns_student(auth.uid(), student_id)
  );

-- 10. Create storage bucket for homework submission images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('homework-submissions', 'homework-submissions', true)
ON CONFLICT (id) DO NOTHING;

-- 11. Storage policies for homework-submissions bucket
CREATE POLICY "Anyone can view homework submission images" ON storage.objects
  FOR SELECT USING (bucket_id = 'homework-submissions');

CREATE POLICY "Authenticated users can upload homework images" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'homework-submissions' AND
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'assistant') OR has_role(auth.uid(), 'teacher'))
  );

CREATE POLICY "Admins and assistants can delete homework images" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'homework-submissions' AND
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'assistant'))
  );

-- 12. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_homework_submissions_student ON public.homework_submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_homework ON public.homework_submissions(homework_id);
CREATE INDEX IF NOT EXISTS idx_homework_submissions_status ON public.homework_submissions(status);
CREATE INDEX IF NOT EXISTS idx_student_point_history_student ON public.student_point_history(student_id);
CREATE INDEX IF NOT EXISTS idx_student_accounts_student ON public.student_accounts(student_id);