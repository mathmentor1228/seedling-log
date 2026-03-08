
-- Security definer function: check if user is admin or the specific admin staff email
CREATE OR REPLACE FUNCTION public.is_admin_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    public.has_role(auth.uid(), 'admin') 
    OR EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id = auth.uid() 
        AND email = 'bfkor8810@naver.com'
    )
$$;

-- Admin tasks table
CREATE TABLE public.admin_office_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL DEFAULT '기타',
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT '대기 중',
  created_by UUID NOT NULL,
  created_by_name TEXT NOT NULL,
  assignee_name TEXT,
  completed_by_name TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_office_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin staff can do all on admin_office_tasks"
  ON public.admin_office_tasks FOR ALL
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());

-- Admin task comments table
CREATE TABLE public.admin_office_task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.admin_office_tasks(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  author_id UUID NOT NULL,
  author_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_office_task_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin staff can do all on admin_office_task_comments"
  ON public.admin_office_task_comments FOR ALL
  USING (public.is_admin_staff())
  WITH CHECK (public.is_admin_staff());
