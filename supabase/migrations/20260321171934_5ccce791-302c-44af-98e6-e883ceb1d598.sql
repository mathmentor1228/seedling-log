
-- Study sessions table: 자습/클리닉 and 테스트 sessions
CREATE TABLE public.study_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_type TEXT NOT NULL DEFAULT '자습', -- '자습', '클리닉', '테스트'
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  subject TEXT NOT NULL,
  supervisor_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  supervisor_name TEXT,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled', -- 'scheduled', 'in_progress', 'completed'
  actual_start_at TIMESTAMPTZ,
  actual_end_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Study session tasks (checklist items for 자습/클리닉)
CREATE TABLE public.study_session_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.study_sessions(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.study_session_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for study_sessions
CREATE POLICY "Authenticated users can view study_sessions"
  ON public.study_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and teachers can insert study_sessions"
  ON public.study_sessions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Admin and teachers can update study_sessions"
  ON public.study_sessions FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Admin can delete study_sessions"
  ON public.study_sessions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS policies for study_session_tasks
CREATE POLICY "Authenticated users can view study_session_tasks"
  ON public.study_session_tasks FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin and teachers can manage study_session_tasks"
  ON public.study_session_tasks FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Admin and teachers can update study_session_tasks"
  ON public.study_session_tasks FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Admin can delete study_session_tasks"
  ON public.study_session_tasks FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin') OR 
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- Enable realtime for study_session_tasks (for live teacher monitoring)
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_session_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.study_sessions;
