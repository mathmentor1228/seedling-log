
-- 1. parent_notifications 테이블
CREATE TABLE public.parent_notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  parent_phone TEXT NOT NULL,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  message TEXT NOT NULL,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  is_read BOOLEAN NOT NULL DEFAULT false,
  type TEXT NOT NULL DEFAULT 'general'
);

ALTER TABLE public.parent_notifications ENABLE ROW LEVEL SECURITY;

-- 원장(admin) can see all
CREATE POLICY "Admin can manage parent_notifications"
ON public.parent_notifications FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 선생님(teacher) can see notifications for their students
CREATE POLICY "Teacher can view own student notifications"
ON public.parent_notifications FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::app_role)
  AND student_id IN (
    SELECT cs.student_id FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE c.teacher_id = auth.uid()
  )
);

-- 조교(assistant) can view all notifications
CREATE POLICY "Assistant can view parent_notifications"
ON public.parent_notifications FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'assistant'::app_role));

-- 2. pattern_alerts 테이블
CREATE TABLE public.pattern_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT '중간' CHECK (priority IN ('높음', '중간', '낮음')),
  created_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID
);

ALTER TABLE public.pattern_alerts ENABLE ROW LEVEL SECURITY;

-- 원장(admin) full access
CREATE POLICY "Admin can manage pattern_alerts"
ON public.pattern_alerts FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 선생님 can view alerts for their students
CREATE POLICY "Teacher can view own student alerts"
ON public.pattern_alerts FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'teacher'::app_role)
  AND (
    student_id IS NULL
    OR student_id IN (
      SELECT cs.student_id FROM public.class_students cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE c.teacher_id = auth.uid()
    )
  )
);

-- 조교 can view all alerts
CREATE POLICY "Assistant can view pattern_alerts"
ON public.pattern_alerts FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'assistant'::app_role));
