-- STUDENT-BOOK-PROGRESS-V1: 학생×교재 책갈피
-- 본교재는 수업 진도 트랙이 관리하고, 보조교재(유형/연산/내신대비)는
-- 학생별 "현재 도달 페이지" 한 줄로 추적한다. 숙제 검사 완료 시 자동 전진(2단계에서 연동).
CREATE TABLE IF NOT EXISTS public.student_book_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  textbook_id uuid REFERENCES public.textbooks(id) ON DELETE SET NULL,
  book_title text NOT NULL,
  subject text NOT NULL DEFAULT '수학',
  book_role text NOT NULL DEFAULT '유형',      -- 개념 | 유형 | 연산 | 내신대비 | 기타
  total_pages int,
  current_page int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active',       -- active | archived
  last_source text,                            -- homework | manual
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (student_id, book_title)
);

GRANT ALL ON public.student_book_progress TO service_role;
ALTER TABLE public.student_book_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON public.student_book_progress
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 교재 목차(단원별 페이지 범위) — 책갈피에 "지금 어느 단원인지" 표시하고,
-- 숙제 범위를 고를 때 단원 컨텍스트를 보여주기 위함 (페이지 세분화).
ALTER TABLE public.textbooks ADD COLUMN IF NOT EXISTS toc jsonb;         -- [{"title":"함수의 극한","start_page":8,"end_page":45}, ...]
ALTER TABLE public.textbooks ADD COLUMN IF NOT EXISTS total_pages int;
