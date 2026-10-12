ALTER TABLE public.exam_analysis_reports
  ADD COLUMN IF NOT EXISTS student_paper_path text,
  ADD COLUMN IF NOT EXISTS teacher_analysis_pdf_path text,
  ADD COLUMN IF NOT EXISTS focus_summary text,
  ADD COLUMN IF NOT EXISTS tricky_points text;