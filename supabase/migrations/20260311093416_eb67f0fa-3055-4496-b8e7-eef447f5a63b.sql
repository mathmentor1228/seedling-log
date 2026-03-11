
CREATE TABLE public.parent_portal_visits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  visited_at timestamptz NOT NULL DEFAULT now(),
  ip_address text
);

CREATE INDEX idx_parent_portal_visits_student ON public.parent_portal_visits(student_id);

-- No RLS needed - accessed only via edge function with service role
ALTER TABLE public.parent_portal_visits ENABLE ROW LEVEL SECURITY;

-- Admin can read visits
CREATE POLICY "Admins can view parent_portal_visits"
  ON public.parent_portal_visits
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
