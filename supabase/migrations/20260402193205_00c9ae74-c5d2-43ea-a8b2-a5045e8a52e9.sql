-- school_schedules: 학교별 학사일정
CREATE TABLE IF NOT EXISTS public.school_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  schedule_type text NOT NULL DEFAULT 'exam',
  title text NOT NULL,
  start_date date,
  end_date date,
  grade integer,
  subject text,
  description text,
  source_file_url text,
  is_ai_extracted boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.school_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read school_schedules"
  ON public.school_schedules FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert school_schedules"
  ON public.school_schedules FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update school_schedules"
  ON public.school_schedules FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete school_schedules"
  ON public.school_schedules FOR DELETE TO authenticated USING (true);

-- Validation trigger for schedule_type
CREATE OR REPLACE FUNCTION public.validate_school_schedule_type()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.schedule_type NOT IN ('exam', 'performance', 'holiday', 'event', 'other') THEN
    RAISE EXCEPTION 'Invalid schedule_type: %', NEW.schedule_type;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_school_schedule_type
  BEFORE INSERT OR UPDATE ON public.school_schedules
  FOR EACH ROW EXECUTE FUNCTION public.validate_school_schedule_type();

-- school_textbooks: 학교별 교과서 정보
CREATE TABLE IF NOT EXISTS public.school_textbooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  grade integer,
  subject text NOT NULL,
  publisher text,
  textbook_name text,
  year integer DEFAULT 2026,
  source_file_url text,
  is_ai_extracted boolean DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.school_textbooks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read school_textbooks"
  ON public.school_textbooks FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert school_textbooks"
  ON public.school_textbooks FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update school_textbooks"
  ON public.school_textbooks FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete school_textbooks"
  ON public.school_textbooks FOR DELETE TO authenticated USING (true);

-- school_files: 업로드 파일 이력
CREATE TABLE IF NOT EXISTS public.school_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_name text NOT NULL,
  file_type text NOT NULL,
  file_name text NOT NULL,
  file_url text NOT NULL,
  subject_filter text DEFAULT 'all',
  ai_extraction_status text DEFAULT 'pending',
  ai_extracted_data jsonb,
  extracted_count integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.school_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read school_files"
  ON public.school_files FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert school_files"
  ON public.school_files FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update school_files"
  ON public.school_files FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete school_files"
  ON public.school_files FOR DELETE TO authenticated USING (true);

-- Validation triggers for school_files
CREATE OR REPLACE FUNCTION public.validate_school_file_fields()
  RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.file_type NOT IN ('school_calendar', 'textbook_list', 'evaluation_plan', 'other') THEN
    RAISE EXCEPTION 'Invalid file_type: %', NEW.file_type;
  END IF;
  IF NEW.subject_filter NOT IN ('all', 'english', 'math', 'other') THEN
    RAISE EXCEPTION 'Invalid subject_filter: %', NEW.subject_filter;
  END IF;
  IF NEW.ai_extraction_status NOT IN ('pending', 'processing', 'completed', 'failed') THEN
    RAISE EXCEPTION 'Invalid ai_extraction_status: %', NEW.ai_extraction_status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_school_file_fields
  BEFORE INSERT OR UPDATE ON public.school_files
  FOR EACH ROW EXECUTE FUNCTION public.validate_school_file_fields();

-- Storage bucket for school documents
INSERT INTO storage.buckets (id, name, public)
VALUES ('school-documents', 'school-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Authenticated users can read school-documents"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'school-documents');

CREATE POLICY "Authenticated users can upload school-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'school-documents');

CREATE POLICY "Authenticated users can update school-documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'school-documents');

CREATE POLICY "Authenticated users can delete school-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'school-documents');