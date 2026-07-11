-- 1) 휴강 처리
ALTER TABLE public.plan_sessions DROP CONSTRAINT IF EXISTS plan_sessions_status_check;
ALTER TABLE public.plan_sessions ADD CONSTRAINT plan_sessions_status_check
  CHECK (status IN ('draft','saved','cancelled'));
ALTER TABLE public.plan_sessions ADD COLUMN IF NOT EXISTS cancel_reason text;

-- 2) 망각곡선 복습
ALTER TABLE public.plan_goal_progress ADD COLUMN IF NOT EXISTS review_count int NOT NULL DEFAULT 0;
ALTER TABLE public.plan_goal_progress ADD COLUMN IF NOT EXISTS review_interval int;
ALTER TABLE public.plan_goal_progress ADD COLUMN IF NOT EXISTS next_review_date date;
CREATE INDEX IF NOT EXISTS idx_pgp_review_due
  ON public.plan_goal_progress(design_id, next_review_date)
  WHERE next_review_date IS NOT NULL;

-- 3) 수업일지 통일 RLS
DROP POLICY IF EXISTS "Teachers can view records of their class students" ON public.lesson_records;
CREATE POLICY "Teachers can view records of their class students"
ON public.lesson_records FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = lesson_records.student_id AND c.teacher_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Teachers can update records of their class students" ON public.lesson_records;
CREATE POLICY "Teachers can update records of their class students"
ON public.lesson_records FOR UPDATE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = lesson_records.student_id AND c.teacher_id = auth.uid()
  )
);

-- 4) 여름방학 특강 신청서
CREATE TABLE IF NOT EXISTS public.intensive_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_name text NOT NULL,
  grade text NOT NULL,
  expectations text[] NOT NULL DEFAULT '{}',
  wishes text,
  consent_agreed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT INSERT ON public.intensive_applications TO anon, authenticated;
GRANT SELECT, DELETE ON public.intensive_applications TO authenticated;
GRANT ALL ON public.intensive_applications TO service_role;

ALTER TABLE public.intensive_applications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can submit an intensive application" ON public.intensive_applications;
CREATE POLICY "Anyone can submit an intensive application"
ON public.intensive_applications FOR INSERT WITH CHECK (consent_agreed = true);

DROP POLICY IF EXISTS "Admins can view intensive applications" ON public.intensive_applications;
CREATE POLICY "Admins can view intensive applications"
ON public.intensive_applications FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete intensive applications" ON public.intensive_applications;
CREATE POLICY "Admins can delete intensive applications"
ON public.intensive_applications FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));