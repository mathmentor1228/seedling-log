
-- School exam archives: one entry per school/year/semester/exam/subject
CREATE TABLE public.school_exam_archives (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  school_name TEXT NOT NULL,
  school_level TEXT NOT NULL DEFAULT '중', -- 초/중/고
  grade_year INT NOT NULL DEFAULT 1,
  subject TEXT NOT NULL, -- 수학, 영어, 국어, 과학 등
  academic_year INT NOT NULL DEFAULT EXTRACT(YEAR FROM now())::INT,
  semester TEXT NOT NULL DEFAULT '1학기', -- 1학기/2학기
  exam_type TEXT NOT NULL DEFAULT '중간고사', -- 중간고사/기말고사/기타
  textbook_publisher TEXT,
  exam_scope TEXT,
  notes TEXT,
  exam_date_start DATE,
  exam_date_end DATE,
  post_exam_analysis TEXT, -- 시험 후 분석
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Materials attached to an archive
CREATE TABLE public.school_exam_materials (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  archive_id UUID NOT NULL REFERENCES public.school_exam_archives(id) ON DELETE CASCADE,
  file_category TEXT NOT NULL DEFAULT '기타', -- 교과서/기출시험지/프린트/시험범위/시험지/기타
  original_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT,
  file_size INT,
  description TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.school_exam_archives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_exam_materials ENABLE ROW LEVEL SECURITY;

-- RLS: all authenticated users can CRUD (admin, teacher, assistant)
CREATE POLICY "Authenticated users can read archives"
  ON public.school_exam_archives FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert archives"
  ON public.school_exam_archives FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update archives"
  ON public.school_exam_archives FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete archives"
  ON public.school_exam_archives FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can read materials"
  ON public.school_exam_materials FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert materials"
  ON public.school_exam_materials FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update materials"
  ON public.school_exam_materials FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete materials"
  ON public.school_exam_materials FOR DELETE TO authenticated USING (true);

-- Storage bucket for exam materials
INSERT INTO storage.buckets (id, name, public) VALUES ('school-exam-materials', 'school-exam-materials', false);

-- Storage RLS
CREATE POLICY "Authenticated users can upload exam materials"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'school-exam-materials');
CREATE POLICY "Authenticated users can read exam materials"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'school-exam-materials');
CREATE POLICY "Authenticated users can delete exam materials"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'school-exam-materials');
