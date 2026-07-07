
CREATE TABLE IF NOT EXISTS public.private_channel_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.private_channel_members TO authenticated;
GRANT ALL ON public.private_channel_members TO service_role;
ALTER TABLE public.private_channel_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "members can view membership" ON public.private_channel_members;
CREATE POLICY "members can view membership"
  ON public.private_channel_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "admin manages membership" ON public.private_channel_members;
CREATE POLICY "admin manages membership"
  ON public.private_channel_members FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.private_channel_members (user_id)
SELECT p.id FROM public.profiles p
WHERE lower(p.email) IN ('engmentor0201@gmail.com','assistanteng99@gmail.com')
ON CONFLICT (user_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_private_channel_member(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.private_channel_members WHERE user_id = _user_id);
$$;
REVOKE EXECUTE ON FUNCTION public.is_private_channel_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_private_channel_member(uuid) TO authenticated;

DROP POLICY IF EXISTS "channel pair manage tags" ON public.private_channel_tags;
CREATE POLICY "channel members manage tags"
  ON public.private_channel_tags FOR ALL TO authenticated
  USING (public.is_private_channel_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.is_private_channel_member(auth.uid()) OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "exam-files staff read"   ON storage.objects;
DROP POLICY IF EXISTS "exam-files staff insert" ON storage.objects;
DROP POLICY IF EXISTS "exam-files staff update" ON storage.objects;
DROP POLICY IF EXISTS "exam-files staff delete" ON storage.objects;

CREATE POLICY "exam-files staff read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'exam-files' AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'assistant')
  ));
CREATE POLICY "exam-files staff insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exam-files' AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'assistant')
  ));
CREATE POLICY "exam-files staff update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'exam-files' AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'assistant')
  ));
CREATE POLICY "exam-files staff delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exam-files' AND (
    public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'teacher') OR public.has_role(auth.uid(),'assistant')
  ));
