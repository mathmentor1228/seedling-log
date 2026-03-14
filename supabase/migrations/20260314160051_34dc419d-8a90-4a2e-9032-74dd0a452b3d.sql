-- Expand concept metadata for multi-subject quiz workflow
ALTER TABLE public.math_concepts
  ADD COLUMN IF NOT EXISTS subject text NOT NULL DEFAULT '수학';

ALTER TABLE public.math_concepts
  ADD COLUMN IF NOT EXISTS quiz_generation_prompt text;

UPDATE public.math_concepts
SET subject = '수학'
WHERE subject IS NULL OR btrim(subject) = '';

CREATE INDEX IF NOT EXISTS idx_math_concepts_subject
  ON public.math_concepts(subject);

-- Grant concept/quiz management to admin + teacher + assistant
DROP POLICY IF EXISTS "Admin full access on math_concepts" ON public.math_concepts;
CREATE POLICY "Staff manage math_concepts"
ON public.math_concepts
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Admin full access on math_concept_quizzes" ON public.math_concept_quizzes;
CREATE POLICY "Staff manage math_concept_quizzes"
ON public.math_concept_quizzes
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Admin/teacher can manage math_quiz_assignments" ON public.math_quiz_assignments;
CREATE POLICY "Staff manage math_quiz_assignments"
ON public.math_quiz_assignments
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Admin/teacher can view all quiz submissions" ON public.math_quiz_submissions;
DROP POLICY IF EXISTS "Admin/teacher can update quiz submissions" ON public.math_quiz_submissions;

CREATE POLICY "Staff can view quiz submissions"
ON public.math_quiz_submissions
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff can update quiz submissions"
ON public.math_quiz_submissions
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Admin/teacher can manage math_student_groups" ON public.math_student_groups;
CREATE POLICY "Staff manage math_student_groups"
ON public.math_student_groups
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

DROP POLICY IF EXISTS "Admin/teacher can manage math_student_group_members" ON public.math_student_group_members;
CREATE POLICY "Staff manage math_student_group_members"
ON public.math_student_group_members
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

-- Storage access for math-concepts bucket
DROP POLICY IF EXISTS "Admin can read math concepts" ON storage.objects;
DROP POLICY IF EXISTS "Admin can upload math concepts" ON storage.objects;
DROP POLICY IF EXISTS "Admin can delete math concepts" ON storage.objects;

CREATE POLICY "Staff can read math concepts"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'math-concepts'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
);

CREATE POLICY "Staff can upload math concepts"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'math-concepts'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
);

CREATE POLICY "Staff can delete math concepts"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'math-concepts'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
);