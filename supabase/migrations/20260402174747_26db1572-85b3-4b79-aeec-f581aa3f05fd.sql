CREATE TABLE public.course_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  course_name TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (subject IN ('수학', '영어', '과학', '국어', '고2탐구')),
  grade_target TEXT NOT NULL CHECK (grade_target IN ('초', '중', '고1', '고2', '고등', '고등수능')),
  monthly_fee NUMERIC NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.course_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view course policies"
  ON public.course_policies FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins can insert course policies"
  ON public.course_policies FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update course policies"
  ON public.course_policies FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete course policies"
  ON public.course_policies FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_course_policies_updated_at
  BEFORE UPDATE ON public.course_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();