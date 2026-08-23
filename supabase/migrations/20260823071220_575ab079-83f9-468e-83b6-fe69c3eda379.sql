-- MENTOR-MAP-V1: 신규 상담 신청(리드) 전용 테이블. 재원생 students와 분리 저장.
CREATE TABLE public.mentor_map_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  student_name text NOT NULL,
  author_type text NOT NULL CHECK (author_type IN ('student','parent','both')),
  school_level text NOT NULL CHECK (school_level IN ('elementary','middle','high')),
  contact_phone text NOT NULL,
  contact_owner text NOT NULL DEFAULT 'parent' CHECK (contact_owner IN ('parent','student')),
  school_name text,
  grade text,
  subjects text[] NOT NULL DEFAULT '{}',
  priority_subjects text[] NOT NULL DEFAULT '{}',
  preferred_method text,
  preferred_time text,
  student_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject_answers jsonb NOT NULL DEFAULT '{}'::jsonb,
  score_info jsonb NOT NULL DEFAULT '{}'::jsonb,
  comm_pref jsonb NOT NULL DEFAULT '{}'::jsonb,
  free_note text,
  consent_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacting','consulted','enrolled','on_hold','archived')),
  assigned_teacher_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at timestamptz,
  submission_hash text UNIQUE,
  source text NOT NULL DEFAULT 'mentor-map-public'
);

CREATE INDEX idx_mentor_map_requests_status ON public.mentor_map_requests (status, created_at DESC);
CREATE INDEX idx_mentor_map_requests_assigned ON public.mentor_map_requests (assigned_teacher_id);

GRANT SELECT, UPDATE ON public.mentor_map_requests TO authenticated;
GRANT ALL ON public.mentor_map_requests TO service_role;
ALTER TABLE public.mentor_map_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mentor_map_admin_select" ON public.mentor_map_requests
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "mentor_map_assigned_teacher_select" ON public.mentor_map_requests
  FOR SELECT TO authenticated USING (assigned_teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));
CREATE POLICY "mentor_map_admin_update" ON public.mentor_map_requests
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "mentor_map_assigned_teacher_update" ON public.mentor_map_requests
  FOR UPDATE TO authenticated
  USING (assigned_teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'))
  WITH CHECK (assigned_teacher_id = auth.uid() AND public.has_role(auth.uid(), 'teacher'));

CREATE TRIGGER trg_mentor_map_requests_updated_at
  BEFORE UPDATE ON public.mentor_map_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 감사 이력 (append-only)
CREATE TABLE public.mentor_map_request_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.mentor_map_requests(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type text NOT NULL CHECK (event_type IN ('status_change','assign','note')),
  from_value text,
  to_value text,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mentor_map_events_request ON public.mentor_map_request_events (request_id, created_at DESC);

GRANT SELECT, INSERT ON public.mentor_map_request_events TO authenticated;
GRANT ALL ON public.mentor_map_request_events TO service_role;
ALTER TABLE public.mentor_map_request_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mentor_map_events_select" ON public.mentor_map_request_events
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.mentor_map_requests r
      WHERE r.id = request_id AND r.assigned_teacher_id = auth.uid()
    )
  );
CREATE POLICY "mentor_map_events_insert" ON public.mentor_map_request_events
  FOR INSERT TO authenticated WITH CHECK (
    actor_id = auth.uid() AND (
      public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1 FROM public.mentor_map_requests r
        WHERE r.id = request_id AND r.assigned_teacher_id = auth.uid()
      )
    )
  );