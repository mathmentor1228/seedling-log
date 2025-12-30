-- 뷰 삭제
DROP VIEW IF EXISTS public.overdue_lesson_drafts;

-- 과목 enum 생성
CREATE TYPE public.subject_type AS ENUM ('수학', '과학', '영어', '국어');

-- lesson_records.subject 컬럼 타입 변경
ALTER TABLE public.lesson_records
  ALTER COLUMN subject TYPE subject_type
  USING subject::subject_type;

-- 뷰 재생성
CREATE OR REPLACE VIEW public.overdue_lesson_drafts AS
SELECT lr.id,
    lr.teacher_id,
    p.full_name AS teacher_name,
    lr.student_id,
    s.name AS student_name,
    lr.subject,
    lr.lesson_date,
    lr.draft_created_at,
    EXTRACT(epoch FROM now() - lr.draft_created_at) / 3600::numeric AS overdue_hours
   FROM lesson_records lr
     JOIN students s ON s.id = lr.student_id
     LEFT JOIN profiles p ON p.id = lr.teacher_id
  WHERE lr.submitted = false AND lr.draft_created_at <= (now() - '24:00:00'::interval)
  ORDER BY lr.draft_created_at;