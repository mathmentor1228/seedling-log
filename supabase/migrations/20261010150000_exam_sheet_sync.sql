-- EXAM-SHEET-SYNC-V1 (2026-10-10) — vault 19 §9 B단계
-- 구글 시트(성적취합표)·드라이브(시험지 PDF)를 Apps Script가 웹으로 밀어 넣는 구조.
-- 시트가 원본, 웹은 복제본: 여기 들어온 점수는 웹에서 고치지 않는다.

-- 1) 성적 행에 시트 출처 정보
ALTER TABLE public.student_exam_results
  ADD COLUMN IF NOT EXISTS source text,                 -- 'sheet' | 'drive' | NULL(기존 수동/학생 업로드)
  ADD COLUMN IF NOT EXISTS sheet_row_no int,            -- 성적입력 탭 No
  ADD COLUMN IF NOT EXISTS sheet_teacher_name text,     -- 시트 담당선생님 열 (매핑 전 표시용)
  ADD COLUMN IF NOT EXISTS previous_score numeric,      -- 시트 '최근성적(직전시험)'
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

-- 2) 시험지 PDF 행에 드라이브 출처 정보 (원본은 드라이브, 본문은 Storage로 복사)
ALTER TABLE public.student_exam_result_pdfs
  ADD COLUMN IF NOT EXISTS source text,                 -- 'drive' | NULL(기존 생성 PDF)
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_file_name text,
  ADD COLUMN IF NOT EXISTS drive_modified_at timestamptz;
CREATE INDEX IF NOT EXISTS student_exam_result_pdfs_drive_file_id_idx ON public.student_exam_result_pdfs (drive_file_id);

-- 3) 동기화 기록 (사이클 탭의 "마지막 동기화 · 미매칭 n" 표시 근거)
CREATE TABLE IF NOT EXISTS public.exam_sheet_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('rows','file')),
  spreadsheet_id text,
  spreadsheet_name text,
  exam_year int,
  exam_period text,                                     -- '1-a' … '2-b'
  exam_type text,                                       -- midterm | final
  received_at timestamptz NOT NULL DEFAULT now(),
  rows_total int NOT NULL DEFAULT 0,
  rows_matched int NOT NULL DEFAULT 0,
  unmatched jsonb NOT NULL DEFAULT '[]'::jsonb,          -- [{row_no, school, grade, name, subject, reason}]
  files_total int NOT NULL DEFAULT 0,
  files_matched int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  detail jsonb                                           -- file: {name, drive_file_id, student_id, result_id}
);
CREATE INDEX IF NOT EXISTS exam_sheet_syncs_key_idx ON public.exam_sheet_syncs (exam_year, exam_period, received_at DESC);
ALTER TABLE public.exam_sheet_syncs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read exam_sheet_syncs" ON public.exam_sheet_syncs;
CREATE POLICY "Staff can read exam_sheet_syncs" ON public.exam_sheet_syncs FOR SELECT TO authenticated USING (public.is_staff());
-- 쓰기는 service role(수신 함수)만. authenticated에 INSERT/UPDATE 정책 없음.
