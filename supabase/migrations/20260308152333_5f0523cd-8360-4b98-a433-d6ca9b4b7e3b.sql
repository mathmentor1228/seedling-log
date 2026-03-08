
-- External links table (OneDrive, Google Drive, etc.)
CREATE TABLE IF NOT EXISTS public.material_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  folder_id UUID REFERENCES public.material_folders(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

ALTER TABLE public.material_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read links"
  ON public.material_links FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers/admins/assistants can insert links"
  ON public.material_links FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Teachers/admins/assistants can update links"
  ON public.material_links FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Teachers/admins/assistants can delete links"
  ON public.material_links FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );
