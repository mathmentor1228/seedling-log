
-- Quiz submissions table
CREATE TABLE public.math_quiz_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  concept_id uuid REFERENCES public.math_concepts(id) ON DELETE CASCADE NOT NULL,
  quiz_id uuid REFERENCES public.math_concept_quizzes(id) ON DELETE CASCADE NOT NULL,
  image_urls text[] NOT NULL DEFAULT '{}',
  ai_grading_result jsonb DEFAULT NULL,
  ai_total_score integer DEFAULT NULL,
  ai_total_questions integer DEFAULT NULL,
  status text NOT NULL DEFAULT 'submitted',
  teacher_override_result jsonb DEFAULT NULL,
  teacher_feedback text DEFAULT NULL,
  teacher_reviewed_by uuid DEFAULT NULL,
  teacher_reviewed_at timestamptz DEFAULT NULL,
  points_awarded integer DEFAULT 0,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_quiz_submissions_student ON public.math_quiz_submissions(student_id);
CREATE INDEX idx_quiz_submissions_concept ON public.math_quiz_submissions(concept_id);
CREATE INDEX idx_quiz_submissions_status ON public.math_quiz_submissions(status);

-- RLS
ALTER TABLE public.math_quiz_submissions ENABLE ROW LEVEL SECURITY;

-- Admin/teacher can view all
CREATE POLICY "Admin/teacher can view all quiz submissions"
  ON public.math_quiz_submissions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'teacher'))
  );

-- Admin/teacher can update (for review)
CREATE POLICY "Admin/teacher can update quiz submissions"
  ON public.math_quiz_submissions FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'teacher'))
  );

-- Insert via edge function (service role), so no insert policy needed for anon

-- Storage bucket for quiz submission images
INSERT INTO storage.buckets (id, name, public) VALUES ('quiz-submissions', 'quiz-submissions', true);

-- Storage policies
CREATE POLICY "Anyone can view quiz submission images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'quiz-submissions');

CREATE POLICY "Authenticated users can upload quiz submission images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'quiz-submissions');

CREATE POLICY "Admin can delete quiz submission images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'quiz-submissions'
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
  );
