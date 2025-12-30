-- 1) students 연락처/상태 보강
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS parent_phone TEXT,
  ADD COLUMN IF NOT EXISTS student_phone TEXT,
  ADD COLUMN IF NOT EXISTS school TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT CHECK (status IN ('normal','caution','risk')) DEFAULT 'normal';

-- 2) attendance 테이블 추가
CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID REFERENCES public.students(id) ON DELETE CASCADE NOT NULL,
  att_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('present','late','absent')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, att_date)
);

ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;

-- RLS: admin 전체, teacher 조회만
CREATE POLICY "Admins can do all on attendance"
ON public.attendance FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers can view attendance"
ON public.attendance FOR SELECT
USING (public.has_role(auth.uid(), 'teacher'));