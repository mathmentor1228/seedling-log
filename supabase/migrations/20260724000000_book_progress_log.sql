-- BOOK-PROGRESS-LOG-V1: 병행교재 날짜별 진도 이력
-- 책갈피(student_book_progress)는 "현재 위치" 한 줄만 유지하므로,
-- 페이스 분석(단원별 체류 기간)과 데일리 알림톡("오늘 p.44~51")을 위해 날짜별 이력을 남긴다.
-- 수업 마무리(TodaySession)에서 페이지 입력 시 자동 기록.
CREATE TABLE IF NOT EXISTS public.student_book_progress_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  book_progress_id uuid REFERENCES public.student_book_progress(id) ON DELETE SET NULL,
  book_title text NOT NULL,
  subject text NOT NULL DEFAULT '수학',
  book_role text,
  progress_date date NOT NULL DEFAULT CURRENT_DATE,
  from_page int,                               -- 직전 책갈피 (이번 진행 시작 직전 페이지)
  to_page int NOT NULL,
  source text NOT NULL DEFAULT 'lesson',       -- lesson | homework | manual
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sbpl_student_date ON public.student_book_progress_log(student_id, progress_date);

GRANT ALL ON public.student_book_progress_log TO service_role;
ALTER TABLE public.student_book_progress_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff full access" ON public.student_book_progress_log
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
