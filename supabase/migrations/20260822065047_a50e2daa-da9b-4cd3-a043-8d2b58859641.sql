CREATE TABLE public.data_quality_acks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id text NOT NULL UNIQUE,
  acked_keys text[] NOT NULL DEFAULT '{}',
  record_count integer NOT NULL DEFAULT 0,
  group_count integer NOT NULL DEFAULT 0,
  acked_by uuid,
  acked_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.data_quality_acks TO authenticated;
GRANT ALL ON public.data_quality_acks TO service_role;

ALTER TABLE public.data_quality_acks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dq_acks_admin_select" ON public.data_quality_acks
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "dq_acks_admin_insert" ON public.data_quality_acks
  FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "dq_acks_admin_update" ON public.data_quality_acks
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));