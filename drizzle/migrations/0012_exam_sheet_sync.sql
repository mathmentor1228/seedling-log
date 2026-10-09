ALTER TABLE public.student_exam_results
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS sheet_row_no int,
  ADD COLUMN IF NOT EXISTS sheet_teacher_name text,
  ADD COLUMN IF NOT EXISTS previous_score numeric,
  ADD COLUMN IF NOT EXISTS synced_at timestamptz;

ALTER TABLE public.student_exam_result_pdfs
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS drive_file_id text,
  ADD COLUMN IF NOT EXISTS drive_file_name text,
  ADD COLUMN IF NOT EXISTS drive_modified_at timestamptz;
CREATE INDEX IF NOT EXISTS student_exam_result_pdfs_drive_file_id_idx ON public.student_exam_result_pdfs (drive_file_id);

CREATE TABLE IF NOT EXISTS public.exam_sheet_syncs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('rows','file')),
  spreadsheet_id text,
  spreadsheet_name text,
  exam_year int,
  exam_period text,
  exam_type text,
  received_at timestamptz NOT NULL DEFAULT now(),
  rows_total int NOT NULL DEFAULT 0,
  rows_matched int NOT NULL DEFAULT 0,
  unmatched jsonb NOT NULL DEFAULT '[]'::jsonb,
  files_total int NOT NULL DEFAULT 0,
  files_matched int NOT NULL DEFAULT 0,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb,
  detail jsonb
);
CREATE INDEX IF NOT EXISTS exam_sheet_syncs_key_idx ON public.exam_sheet_syncs (exam_year, exam_period, received_at DESC);
ALTER TABLE public.exam_sheet_syncs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Staff can read exam_sheet_syncs" ON public.exam_sheet_syncs;
CREATE POLICY "Staff can read exam_sheet_syncs" ON public.exam_sheet_syncs FOR SELECT TO authenticated USING (public.is_staff());