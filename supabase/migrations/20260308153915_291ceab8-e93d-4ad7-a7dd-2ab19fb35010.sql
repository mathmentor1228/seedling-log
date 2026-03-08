
-- Enable realtime for admin office tables
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_office_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_office_task_comments;

-- Track last-read timestamp per user for admin office notifications
CREATE TABLE public.admin_office_read_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_office_read_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin staff can manage own read status"
  ON public.admin_office_read_status FOR ALL
  USING (public.is_admin_staff() AND user_id = auth.uid())
  WITH CHECK (public.is_admin_staff() AND user_id = auth.uid());
