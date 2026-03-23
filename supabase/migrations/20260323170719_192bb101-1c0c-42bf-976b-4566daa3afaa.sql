
-- Student groups for timetable management
CREATE TABLE public.student_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Group members
CREATE TABLE public.student_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(group_id, student_id)
);

-- Link groups to class schedules
CREATE TABLE public.schedule_group_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schedule_id, group_id)
);

-- Exceptions: students excluded from specific schedule slots within their group
CREATE TABLE public.schedule_group_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES public.class_schedules(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.student_groups(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(schedule_id, group_id, student_id)
);

-- RLS
ALTER TABLE public.student_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_group_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedule_group_exceptions ENABLE ROW LEVEL SECURITY;

-- Policies: admin/teacher/assistant can manage
CREATE POLICY "Authenticated users can read student_groups" ON public.student_groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can manage student_groups" ON public.student_groups FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Authenticated users can read student_group_members" ON public.student_group_members FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can manage student_group_members" ON public.student_group_members FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Authenticated users can read schedule_group_assignments" ON public.schedule_group_assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can manage schedule_group_assignments" ON public.schedule_group_assignments FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Authenticated users can read schedule_group_exceptions" ON public.schedule_group_exceptions FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin/teacher can manage schedule_group_exceptions" ON public.schedule_group_exceptions FOR ALL TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher') OR public.has_role(auth.uid(), 'assistant')
);
