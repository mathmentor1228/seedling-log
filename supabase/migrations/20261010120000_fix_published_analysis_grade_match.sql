-- FIX-PUBLISHED-ANALYSIS-GRADE-MATCH (2026-10-10)
-- 학부모 포털·학생 앱이 공개 분석보고서를 고르는 함수가 학년 표기 차이로 항상 0건이던 문제.
--   students: format_student_grade_label('중', 2) = '중2'
--   exam_analysis_reports.grade: 실제 데이터는 '1' / '2' / '3' (2026-10-10 실측 9건 전부)
-- → 두 표기('중2', '2', '2학년') 모두 같은 학년으로 본다. 다른 로직은 그대로.

CREATE OR REPLACE FUNCTION public.get_published_analysis_for_student(_student_id uuid)
RETURNS SETOF public.exam_analysis_reports
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _school text;
  _grade_label text;
  _grade_year integer;
BEGIN
  SELECT s.school,
         public.format_student_grade_label(s.school_level, s.grade_year),
         s.grade_year
  INTO _school, _grade_label, _grade_year
  FROM public.students s
  WHERE s.id = _student_id;

  IF _school IS NULL OR _grade_year IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT r.*
  FROM public.exam_analysis_reports r
  WHERE r.is_published = true
    AND (r.published_at IS NULL OR r.published_at <= now())
    AND replace(r.school_name, ' ', '') = replace(_school, ' ', '')
    AND regexp_replace(COALESCE(r.grade, ''), '\s', '', 'g') IN (
      COALESCE(_grade_label, ''),            -- '중2'
      _grade_year::text,                     -- '2'
      _grade_year::text || '학년'            -- '2학년'
    )
    AND EXISTS (
      SELECT 1
      FROM public.class_students cs
      JOIN public.classes c ON c.id = cs.class_id
      WHERE cs.student_id = _student_id
        AND c.subject::text = r.subject
    )
  ORDER BY COALESCE(r.published_at, r.updated_at) DESC;
END;
$$;

-- 검증 (NOTICE): 공개 리포트가 있는 학교·학년의 재원생 중 매칭되는 학생 수
DO $$
DECLARE n int;
BEGIN
  SELECT count(DISTINCT s.id) INTO n
  FROM public.students s
  WHERE s.enrollment_status IN ('재학','재등원')
    AND EXISTS (SELECT 1 FROM public.get_published_analysis_for_student(s.id));
  RAISE NOTICE 'students with at least one published analysis report now: %', n;
END $$;
