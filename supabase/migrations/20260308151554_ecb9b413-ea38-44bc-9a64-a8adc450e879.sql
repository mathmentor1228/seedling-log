
-- 1. Create storage bucket for materials
INSERT INTO storage.buckets (id, name, public)
VALUES ('materials', 'materials', false)
ON CONFLICT (id) DO NOTHING;

-- 2. Create material_folders table
CREATE TABLE IF NOT EXISTS public.material_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id UUID REFERENCES public.material_folders(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(subject, name, parent_id)
);

-- 3. Create material_files table
CREATE TABLE IF NOT EXISTS public.material_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject TEXT NOT NULL,
  folder_id UUID REFERENCES public.material_folders(id) ON DELETE CASCADE,
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- 4. Enable RLS
ALTER TABLE public.material_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_files ENABLE ROW LEVEL SECURITY;

-- 5. RLS for material_folders: teacher/admin/assistant can CRUD
CREATE POLICY "Authenticated users can read folders"
  ON public.material_folders FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers/admins/assistants can insert folders"
  ON public.material_folders FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Teachers/admins/assistants can update folders"
  ON public.material_folders FOR UPDATE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Teachers/admins/assistants can delete folders"
  ON public.material_folders FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- 6. RLS for material_files
CREATE POLICY "Authenticated users can read files"
  ON public.material_files FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Teachers/admins/assistants can insert files"
  ON public.material_files FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );

CREATE POLICY "Teachers/admins/assistants can delete files"
  ON public.material_files FOR DELETE
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'admin') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- 7. Storage RLS policies for materials bucket
CREATE POLICY "Authenticated users can read materials"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'materials');

CREATE POLICY "Teachers/admins/assistants can upload materials"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'materials' AND (
      public.has_role(auth.uid(), 'teacher') OR
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'assistant')
    )
  );

CREATE POLICY "Teachers/admins/assistants can delete materials"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'materials' AND (
      public.has_role(auth.uid(), 'teacher') OR
      public.has_role(auth.uid(), 'admin') OR
      public.has_role(auth.uid(), 'assistant')
    )
  );
