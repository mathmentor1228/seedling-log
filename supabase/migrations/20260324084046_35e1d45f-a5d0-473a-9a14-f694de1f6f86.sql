ALTER TABLE public.exam_prep_courses ADD COLUMN deleted_at timestamptz DEFAULT NULL;
CREATE INDEX idx_exam_prep_courses_deleted_at ON public.exam_prep_courses (deleted_at);