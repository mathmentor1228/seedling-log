
DROP POLICY IF EXISTS "auth all reports" ON public.school_exam_reports;

CREATE POLICY "Authenticated can view exam reports"
ON public.school_exam_reports FOR SELECT
TO authenticated USING (true);

CREATE POLICY "Staff can insert exam reports"
ON public.school_exam_reports FOR INSERT
TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'assistant'::app_role)
);

CREATE POLICY "Staff can update exam reports"
ON public.school_exam_reports FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'teacher'::app_role)
  OR has_role(auth.uid(), 'assistant'::app_role)
);

CREATE POLICY "Admins can delete exam reports"
ON public.school_exam_reports FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Authenticated can view event_acks" ON public.event_acks;
CREATE POLICY "Authenticated can view event_acks"
ON public.event_acks FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can upload math question photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update math question photos" ON storage.objects;

CREATE POLICY "Authenticated users can upload math question photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'math-questions');

CREATE POLICY "Authenticated users can update math question photos"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'math-questions');

DROP POLICY IF EXISTS "Assistants can view student_accounts" ON public.student_accounts;
DROP POLICY IF EXISTS "Assistants can update student_accounts" ON public.student_accounts;

CREATE OR REPLACE VIEW public.student_accounts_safe AS
SELECT id, student_id, last_login_at, created_at, updated_at
FROM public.student_accounts;

GRANT SELECT ON public.student_accounts_safe TO authenticated;

CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT public.has_role(auth.uid(), 'admin')
$function$;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::app_role FROM public.profiles WHERE email = 'bfkor8810@naver.com'
ON CONFLICT (user_id, role) DO NOTHING;
