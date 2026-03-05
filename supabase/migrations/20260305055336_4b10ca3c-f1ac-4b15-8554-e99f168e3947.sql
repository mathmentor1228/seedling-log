
CREATE TABLE public.school_calendar_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name TEXT NOT NULL,
  school_level TEXT NOT NULL DEFAULT '중',
  academic_year INTEGER NOT NULL DEFAULT (EXTRACT(year FROM now()))::integer,
  semester TEXT NOT NULL DEFAULT '1학기',
  storage_path TEXT NOT NULL,
  original_name TEXT NOT NULL,
  mime_type TEXT,
  file_size INTEGER,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(school_name, school_level, academic_year, semester, storage_path)
);

ALTER TABLE public.school_calendar_images ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read calendar images" ON public.school_calendar_images FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert calendar images" ON public.school_calendar_images FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can delete calendar images" ON public.school_calendar_images FOR DELETE TO authenticated USING (true);
