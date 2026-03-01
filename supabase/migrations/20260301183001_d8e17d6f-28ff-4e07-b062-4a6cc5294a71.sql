
-- Update generate_weekly_reports to exclude withdrawn students
CREATE OR REPLACE FUNCTION public.generate_weekly_reports(_week_start date, _week_end date, _student_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD;
  total_lessons_i INT;
  avg_under NUMERIC(3,2);
  not_done_cnt INT;
  partial_cnt INT;
  completed_cnt INT;
  absent_cnt INT;
  risk_score INT;
  risk_txt TEXT;
  issues TEXT[];
  student_msg TEXT;
  parent_msg TEXT;
  student_name_v TEXT;
  week_range_txt TEXT;
  breakdown JSONB;
  subj_name TEXT;
  subj_lessons INT;
  subj_avg NUMERIC(3,2);
  subj_completed INT;
  subj_partial INT;
  subj_not_done INT;
  subj_issues TEXT[];
  subj_next_plan TEXT;
  hw_sentence TEXT;
  issues_sentence TEXT;
  subj_student_section TEXT;
  subj_parent_section TEXT;
  prev_report RECORD;
  prev_avg NUMERIC(3,2);
  prev_lessons INT;
  prev_issues TEXT[];
  comparison_sentence TEXT;
  issue_repeat_cnt INT;
  test_rec RECORD;
  test_sentence TEXT;
  exception_rec RECORD;
  exception_lines TEXT[];
  exception_section TEXT;
  hyugang_rec RECORD;
  hyugang_lines TEXT[];
  hyugang_section TEXT;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can generate weekly reports';
  END IF;

  week_range_txt := to_char(_week_start, 'MM/DD') || '~' || to_char(_week_end, 'MM/DD');

  FOR s IN 
    SELECT id, name FROM public.students 
    WHERE (_student_ids IS NULL OR id = ANY(_student_ids))
      AND enrollment_status != '퇴원'
  LOOP
    student_name_v := s.name;
    breakdown := '[]'::jsonb;
    student_msg := '';
    parent_msg := '';
    comparison_sentence := '';
    exception_lines := '{}';
    hyugang_lines := '{}';
    
    SELECT wr.avg_understanding, wr.total_lessons, wr.common_issues
    INTO prev_avg, prev_lessons, prev_issues
    FROM public.weekly_reports wr
    WHERE wr.student_id = s.id
      AND wr.week_start < _week_start
    ORDER BY wr.week_start DESC
    LIMIT 1;
    
    SELECT
      COUNT(*)::INT,
      AVG(CASE WHEN NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN understanding_score ELSE NULL END)::NUMERIC(3,2),
      COALESCE(SUM(CASE WHEN homework_status = 'not_done' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
      COALESCE(SUM(CASE WHEN homework_status = 'partial' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
      COALESCE(SUM(CASE WHEN homework_status = 'completed' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
      COALESCE((
        SELECT SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END)
        FROM public.attendance a
        WHERE a.student_id = s.id AND a.att_date BETWEEN _week_start AND _week_end
      ),0)::INT,
      COALESCE((
        SELECT ARRAY(
          SELECT issue FROM (
            SELECT unnest(lr2.learning_issues) AS issue, COUNT(*) cnt
            FROM public.lesson_records lr2
            WHERE lr2.student_id = s.id 
              AND lr2.lesson_date BETWEEN _week_start AND _week_end
              AND lr2.submitted = true
              AND NOT ('휴강' = ANY(COALESCE(lr2.lesson_types, '{}')))
            GROUP BY 1 ORDER BY cnt DESC LIMIT 2
          ) t
        )
      ),'{}'::TEXT[])
    INTO total_lessons_i, avg_under, not_done_cnt, partial_cnt, completed_cnt, absent_cnt, issues
    FROM public.lesson_records lr
    WHERE lr.student_id = s.id
      AND lr.lesson_date BETWEEN _week_start AND _week_end
      AND lr.submitted = true;

    total_lessons_i := COALESCE(total_lessons_i, 0);

    FOR hyugang_rec IN
      SELECT lr.lesson_date, lr.subject::text AS subject_txt
      FROM public.lesson_records lr
      WHERE lr.student_id = s.id
        AND lr.lesson_date BETWEEN _week_start AND _week_end
        AND lr.submitted = true
        AND '휴강' = ANY(COALESCE(lr.lesson_types, '{}'))
      ORDER BY lr.lesson_date, lr.subject
    LOOP
      DECLARE
        date_txt TEXT;
      BEGIN
        date_txt := EXTRACT(MONTH FROM hyugang_rec.lesson_date)::TEXT || '월 ' || EXTRACT(DAY FROM hyugang_rec.lesson_date)::TEXT || '일';
        hyugang_lines := array_append(hyugang_lines, date_txt || ' ' || hyugang_rec.subject_txt || ' 휴강');
      END;
    END LOOP;

    FOR exception_rec IN
      SELECT lr.lesson_date, lr.subject::text AS subject_txt, lr.lesson_types, lr.attendance_status
      FROM public.lesson_records lr
      WHERE lr.student_id = s.id
        AND lr.lesson_date BETWEEN _week_start AND _week_end
        AND lr.submitted = true
        AND NOT ('휴강' = ANY(COALESCE(lr.lesson_types, '{}')))
        AND (
          ARRAY['보강', '시험대비특강', '테스트'] && COALESCE(lr.lesson_types, '{}')
          OR ARRAY['지각', '조퇴', '결석'] && COALESCE(lr.attendance_status, '{}')
        )
      ORDER BY lr.lesson_date, lr.subject
    LOOP
      DECLARE
        date_txt TEXT;
        ex_detail TEXT;
      BEGIN
        date_txt := EXTRACT(MONTH FROM exception_rec.lesson_date)::TEXT || '월 ' || EXTRACT(DAY FROM exception_rec.lesson_date)::TEXT || '일';
        ex_detail := '';
        IF '보강' = ANY(exception_rec.lesson_types) THEN ex_detail := ex_detail || ' 보강'; END IF;
        IF '시험대비특강' = ANY(exception_rec.lesson_types) THEN ex_detail := ex_detail || ' 시험대비특강'; END IF;
        IF '테스트' = ANY(exception_rec.lesson_types) THEN ex_detail := ex_detail || ' 테스트'; END IF;
        IF '지각' = ANY(exception_rec.attendance_status) THEN ex_detail := ex_detail || ' 지각'; END IF;
        IF '조퇴' = ANY(exception_rec.attendance_status) THEN ex_detail := ex_detail || ' 조퇴'; END IF;
        IF '결석' = ANY(exception_rec.attendance_status) THEN ex_detail := ex_detail || ' 결석'; END IF;
        exception_lines := array_append(exception_lines, date_txt || ' ' || exception_rec.subject_txt || ':' || TRIM(ex_detail));
      END;
    END LOOP;

    risk_score := 0;
    IF avg_under IS NOT NULL AND avg_under < 3 THEN risk_score := risk_score + 2; END IF;
    IF not_done_cnt >= 2 THEN risk_score := risk_score + 2; 
    ELSIF not_done_cnt >= 1 THEN risk_score := risk_score + 1; END IF;
    IF absent_cnt >= 2 THEN risk_score := risk_score + 2;
    ELSIF absent_cnt >= 1 THEN risk_score := risk_score + 1; END IF;
    IF array_length(issues, 1) > 0 AND prev_issues IS NOT NULL AND issues && prev_issues THEN
      risk_score := risk_score + 1;
    END IF;
    
    IF risk_score >= 4 THEN risk_txt := 'high';
    ELSIF risk_score >= 2 THEN risk_txt := 'medium';
    ELSE risk_txt := 'low';
    END IF;

    FOR subj_name IN 
      SELECT DISTINCT subject::text FROM public.lesson_records 
      WHERE student_id = s.id AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true
    LOOP
      SELECT 
        COUNT(*)::INT,
        AVG(CASE WHEN NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN understanding_score ELSE NULL END)::NUMERIC(3,2),
        COALESCE(SUM(CASE WHEN homework_status='completed' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='partial' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='not_done' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE((SELECT ARRAY(SELECT unnest(learning_issues) FROM public.lesson_records WHERE student_id=s.id AND subject::text=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) LIMIT 2)), '{}'),
        (SELECT next_lesson_goal FROM public.lesson_records WHERE student_id=s.id AND subject::text=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) ORDER BY lesson_date DESC LIMIT 1)
      INTO subj_lessons, subj_avg, subj_completed, subj_partial, subj_not_done, subj_issues, subj_next_plan
      FROM public.lesson_records
      WHERE student_id = s.id AND subject::text = subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true;

      breakdown := breakdown || jsonb_build_object(
        'subject', subj_name,
        'lessons', subj_lessons,
        'avg', subj_avg,
        'completed', subj_completed,
        'partial', subj_partial,
        'not_done', subj_not_done,
        'issues', subj_issues,
        'next_plan', subj_next_plan
      );

      IF subj_completed > 0 AND subj_not_done = 0 AND subj_partial = 0 THEN
        hw_sentence := '숙제 완료율 100%';
      ELSIF subj_not_done > 0 THEN
        hw_sentence := '숙제 미완료 ' || subj_not_done || '회';
      ELSE
        hw_sentence := '';
      END IF;

      IF array_length(subj_issues, 1) > 0 THEN
        issues_sentence := array_to_string(subj_issues, ', ');
      ELSE
        issues_sentence := '';
      END IF;

      subj_student_section := '【' || subj_name || '】 ';
      IF subj_avg IS NOT NULL THEN
        subj_student_section := subj_student_section || '이해도 ' || subj_avg || '/5';
      END IF;
      IF hw_sentence <> '' THEN
        subj_student_section := subj_student_section || ' / ' || hw_sentence;
      END IF;
      IF subj_next_plan IS NOT NULL AND subj_next_plan <> '' THEN
        subj_student_section := subj_student_section || E'\n→ 다음 목표: ' || subj_next_plan;
      END IF;
      student_msg := student_msg || subj_student_section || E'\n';

      subj_parent_section := '【' || subj_name || '】 수업 ' || subj_lessons || '회';
      IF subj_avg IS NOT NULL THEN
        subj_parent_section := subj_parent_section || ', 평균 이해도 ' || subj_avg || '/5';
      END IF;
      IF issues_sentence <> '' THEN
        subj_parent_section := subj_parent_section || E'\n· 학습 포인트: ' || issues_sentence;
      END IF;
      IF hw_sentence <> '' THEN
        subj_parent_section := subj_parent_section || E'\n· ' || hw_sentence;
      END IF;
      IF subj_next_plan IS NOT NULL AND subj_next_plan <> '' THEN
        subj_parent_section := subj_parent_section || E'\n· 다음 주 계획: ' || subj_next_plan;
      END IF;
      parent_msg := parent_msg || subj_parent_section || E'\n\n';
    END LOOP;

    FOR test_rec IN
      SELECT lr.test_date, lr.subject::text AS subject_txt, lr.test_name, lr.test_result_text
      FROM public.lesson_records lr
      WHERE lr.student_id = s.id
        AND lr.lesson_date BETWEEN _week_start AND _week_end
        AND lr.submitted = true
        AND lr.test_result_text IS NOT NULL
        AND lr.test_result_text <> ''
    LOOP
      test_sentence := '· 시험: ';
      IF test_rec.test_date IS NOT NULL THEN
        test_sentence := test_sentence || to_char(test_rec.test_date, 'MM/DD') || ' ';
      END IF;
      test_sentence := test_sentence || test_rec.subject_txt;
      IF test_rec.test_name IS NOT NULL AND test_rec.test_name <> '' THEN
        test_sentence := test_sentence || ' ' || test_rec.test_name;
      END IF;
      test_sentence := test_sentence || ' - ' || test_rec.test_result_text;
      parent_msg := parent_msg || test_sentence || E'\n';
    END LOOP;

    IF array_length(hyugang_lines, 1) > 0 THEN
      hyugang_section := E'\n📌 휴강:\n' || array_to_string(hyugang_lines, E'\n');
      parent_msg := parent_msg || hyugang_section || E'\n';
    END IF;

    IF array_length(exception_lines, 1) > 0 THEN
      exception_section := E'\n📌 이번 주 특이사항:\n' || array_to_string(exception_lines, E'\n');
      parent_msg := parent_msg || exception_section || E'\n';
    END IF;

    IF prev_avg IS NOT NULL AND avg_under IS NOT NULL THEN
      IF avg_under > prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 향상되었습니다.';
      ELSIF avg_under < prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 다소 낮아졌습니다.';
      ELSE
        comparison_sentence := '지난주와 비슷한 이해도를 유지하고 있습니다.';
      END IF;
    END IF;

    student_msg := '[더멘토] ' || student_name_v || ' 주간리포트 (' || week_range_txt || ')' || E'\n\n' || student_msg;
    IF comparison_sentence <> '' THEN
      student_msg := student_msg || E'\n' || comparison_sentence;
    END IF;
    
    parent_msg := '[더멘토] ' || student_name_v || ' 주간 학습 리포트 (' || week_range_txt || ')' || E'\n\n' || parent_msg;
    IF comparison_sentence <> '' THEN
      parent_msg := parent_msg || comparison_sentence;
    END IF;

    INSERT INTO public.weekly_reports (
      student_id, week_start, week_end, total_lessons, avg_understanding,
      homework_completion_rate, common_issues, risk_level, 
      student_message, parent_message, generated_at,
      subject_breakdown
    ) VALUES (
      s.id, _week_start, _week_end, total_lessons_i, avg_under,
      CASE WHEN (completed_cnt + partial_cnt + not_done_cnt) > 0 
           THEN (completed_cnt::NUMERIC / (completed_cnt + partial_cnt + not_done_cnt) * 100)::NUMERIC(5,2)
           ELSE NULL END,
      issues, risk_txt,
      student_msg, parent_msg, now(),
      breakdown
    )
    ON CONFLICT (student_id, week_start) 
    DO UPDATE SET
      week_end = EXCLUDED.week_end,
      total_lessons = EXCLUDED.total_lessons,
      avg_understanding = EXCLUDED.avg_understanding,
      homework_completion_rate = EXCLUDED.homework_completion_rate,
      common_issues = EXCLUDED.common_issues,
      risk_level = EXCLUDED.risk_level,
      student_message = EXCLUDED.student_message,
      parent_message = EXCLUDED.parent_message,
      generated_at = EXCLUDED.generated_at,
      subject_breakdown = EXCLUDED.subject_breakdown;
  END LOOP;
END;
$function$;

-- Update generate_weekly_reports_scheduled to exclude withdrawn students
CREATE OR REPLACE FUNCTION public.generate_weekly_reports_scheduled(_week_start date, _week_end date, _student_ids uuid[] DEFAULT NULL::uuid[])
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD;
  total_lessons_i INT;
  avg_under NUMERIC(3,2);
  not_done_cnt INT;
  partial_cnt INT;
  completed_cnt INT;
  absent_cnt INT;
  risk_score INT;
  risk_txt TEXT;
  issues TEXT[];
  student_msg TEXT;
  parent_msg TEXT;
  student_name_v TEXT;
  week_range_txt TEXT;
  breakdown JSONB;
  subj_name TEXT;
  subj_lessons INT;
  subj_avg NUMERIC(3,2);
  subj_completed INT;
  subj_partial INT;
  subj_not_done INT;
  subj_issues TEXT[];
  subj_next_plan TEXT;
  hw_sentence TEXT;
  issues_sentence TEXT;
  subj_student_section TEXT;
  subj_parent_section TEXT;
  prev_report RECORD;
  prev_avg NUMERIC(3,2);
  prev_lessons INT;
  prev_issues TEXT[];
  comparison_sentence TEXT;
  issue_repeat_cnt INT;
  test_rec RECORD;
  test_sentence TEXT;
  exception_rec RECORD;
  exception_lines TEXT[];
  exception_section TEXT;
  hyugang_rec RECORD;
  hyugang_lines TEXT[];
  hyugang_section TEXT;
BEGIN
  week_range_txt := to_char(_week_start, 'MM/DD') || '~' || to_char(_week_end, 'MM/DD');

  FOR s IN 
    SELECT id, name FROM public.students 
    WHERE (_student_ids IS NULL OR id = ANY(_student_ids))
      AND enrollment_status != '퇴원'
  LOOP
    student_name_v := s.name;
    breakdown := '[]'::jsonb;
    student_msg := '';
    parent_msg := '';
    comparison_sentence := '';
    exception_lines := '{}';
    hyugang_lines := '{}';
    
    SELECT wr.avg_understanding, wr.total_lessons, wr.common_issues
    INTO prev_avg, prev_lessons, prev_issues
    FROM public.weekly_reports wr
    WHERE wr.student_id = s.id
      AND wr.week_start < _week_start
    ORDER BY wr.week_start DESC
    LIMIT 1;
    
    SELECT
      COUNT(*)::INT,
      AVG(CASE WHEN NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN understanding_score ELSE NULL END)::NUMERIC(3,2),
      COALESCE(SUM(CASE WHEN homework_status = 'not_done' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
      COALESCE(SUM(CASE WHEN homework_status = 'partial' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
      COALESCE(SUM(CASE WHEN homework_status = 'completed' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
      COALESCE((
        SELECT SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END)
        FROM public.attendance a
        WHERE a.student_id = s.id AND a.att_date BETWEEN _week_start AND _week_end
      ),0)::INT,
      COALESCE((
        SELECT ARRAY(
          SELECT issue FROM (
            SELECT unnest(lr2.learning_issues) AS issue, COUNT(*) cnt
            FROM public.lesson_records lr2
            WHERE lr2.student_id = s.id 
              AND lr2.lesson_date BETWEEN _week_start AND _week_end
              AND lr2.submitted = true
              AND NOT ('휴강' = ANY(COALESCE(lr2.lesson_types, '{}')))
            GROUP BY 1 ORDER BY cnt DESC LIMIT 2
          ) t
        )
      ),'{}'::TEXT[])
    INTO total_lessons_i, avg_under, not_done_cnt, partial_cnt, completed_cnt, absent_cnt, issues
    FROM public.lesson_records lr
    WHERE lr.student_id = s.id
      AND lr.lesson_date BETWEEN _week_start AND _week_end
      AND lr.submitted = true;

    total_lessons_i := COALESCE(total_lessons_i, 0);

    FOR hyugang_rec IN
      SELECT lr.lesson_date, lr.subject::text AS subject_txt
      FROM public.lesson_records lr
      WHERE lr.student_id = s.id
        AND lr.lesson_date BETWEEN _week_start AND _week_end
        AND lr.submitted = true
        AND '휴강' = ANY(COALESCE(lr.lesson_types, '{}'))
      ORDER BY lr.lesson_date, lr.subject
    LOOP
      DECLARE
        date_txt TEXT;
      BEGIN
        date_txt := EXTRACT(MONTH FROM hyugang_rec.lesson_date)::TEXT || '월 ' || EXTRACT(DAY FROM hyugang_rec.lesson_date)::TEXT || '일';
        hyugang_lines := array_append(hyugang_lines, date_txt || ' ' || hyugang_rec.subject_txt || ' 휴강');
      END;
    END LOOP;

    FOR exception_rec IN
      SELECT lr.lesson_date, lr.subject::text AS subject_txt, lr.lesson_types, lr.attendance_status
      FROM public.lesson_records lr
      WHERE lr.student_id = s.id
        AND lr.lesson_date BETWEEN _week_start AND _week_end
        AND lr.submitted = true
        AND NOT ('휴강' = ANY(COALESCE(lr.lesson_types, '{}')))
        AND (
          ARRAY['보강', '시험대비특강', '테스트'] && COALESCE(lr.lesson_types, '{}')
          OR ARRAY['지각', '조퇴', '결석'] && COALESCE(lr.attendance_status, '{}')
        )
      ORDER BY lr.lesson_date, lr.subject
    LOOP
      DECLARE
        date_txt TEXT;
        ex_detail TEXT;
      BEGIN
        date_txt := EXTRACT(MONTH FROM exception_rec.lesson_date)::TEXT || '월 ' || EXTRACT(DAY FROM exception_rec.lesson_date)::TEXT || '일';
        ex_detail := '';
        IF '보강' = ANY(exception_rec.lesson_types) THEN ex_detail := ex_detail || ' 보강'; END IF;
        IF '시험대비특강' = ANY(exception_rec.lesson_types) THEN ex_detail := ex_detail || ' 시험대비특강'; END IF;
        IF '테스트' = ANY(exception_rec.lesson_types) THEN ex_detail := ex_detail || ' 테스트'; END IF;
        IF '지각' = ANY(exception_rec.attendance_status) THEN ex_detail := ex_detail || ' 지각'; END IF;
        IF '조퇴' = ANY(exception_rec.attendance_status) THEN ex_detail := ex_detail || ' 조퇴'; END IF;
        IF '결석' = ANY(exception_rec.attendance_status) THEN ex_detail := ex_detail || ' 결석'; END IF;
        exception_lines := array_append(exception_lines, date_txt || ' ' || exception_rec.subject_txt || ':' || TRIM(ex_detail));
      END;
    END LOOP;

    risk_score := 0;
    IF avg_under IS NOT NULL AND avg_under < 3 THEN risk_score := risk_score + 2; END IF;
    IF not_done_cnt >= 2 THEN risk_score := risk_score + 2; 
    ELSIF not_done_cnt >= 1 THEN risk_score := risk_score + 1; END IF;
    IF absent_cnt >= 2 THEN risk_score := risk_score + 2;
    ELSIF absent_cnt >= 1 THEN risk_score := risk_score + 1; END IF;
    IF array_length(issues, 1) > 0 AND prev_issues IS NOT NULL AND issues && prev_issues THEN
      risk_score := risk_score + 1;
    END IF;
    
    IF risk_score >= 4 THEN risk_txt := 'high';
    ELSIF risk_score >= 2 THEN risk_txt := 'medium';
    ELSE risk_txt := 'low';
    END IF;

    FOR subj_name IN 
      SELECT DISTINCT subject::text FROM public.lesson_records 
      WHERE student_id = s.id AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true
    LOOP
      SELECT 
        COUNT(*)::INT,
        AVG(CASE WHEN NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN understanding_score ELSE NULL END)::NUMERIC(3,2),
        COALESCE(SUM(CASE WHEN homework_status='completed' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='partial' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='not_done' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE((SELECT ARRAY(SELECT unnest(learning_issues) FROM public.lesson_records WHERE student_id=s.id AND subject::text=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) LIMIT 2)), '{}'),
        (SELECT next_lesson_goal FROM public.lesson_records WHERE student_id=s.id AND subject::text=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) ORDER BY lesson_date DESC LIMIT 1)
      INTO subj_lessons, subj_avg, subj_completed, subj_partial, subj_not_done, subj_issues, subj_next_plan
      FROM public.lesson_records
      WHERE student_id = s.id AND subject::text = subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true;

      breakdown := breakdown || jsonb_build_object(
        'subject', subj_name,
        'lessons', subj_lessons,
        'avg', subj_avg,
        'completed', subj_completed,
        'partial', subj_partial,
        'not_done', subj_not_done,
        'issues', subj_issues,
        'next_plan', subj_next_plan
      );

      IF subj_completed > 0 AND subj_not_done = 0 AND subj_partial = 0 THEN
        hw_sentence := '숙제 완료율 100%';
      ELSIF subj_not_done > 0 THEN
        hw_sentence := '숙제 미완료 ' || subj_not_done || '회';
      ELSE
        hw_sentence := '';
      END IF;

      IF array_length(subj_issues, 1) > 0 THEN
        issues_sentence := array_to_string(subj_issues, ', ');
      ELSE
        issues_sentence := '';
      END IF;

      subj_student_section := '【' || subj_name || '】 ';
      IF subj_avg IS NOT NULL THEN
        subj_student_section := subj_student_section || '이해도 ' || subj_avg || '/5';
      END IF;
      IF hw_sentence <> '' THEN
        subj_student_section := subj_student_section || ' / ' || hw_sentence;
      END IF;
      IF subj_next_plan IS NOT NULL AND subj_next_plan <> '' THEN
        subj_student_section := subj_student_section || E'\n→ 다음 목표: ' || subj_next_plan;
      END IF;
      student_msg := student_msg || subj_student_section || E'\n';

      subj_parent_section := '【' || subj_name || '】 수업 ' || subj_lessons || '회';
      IF subj_avg IS NOT NULL THEN
        subj_parent_section := subj_parent_section || ', 평균 이해도 ' || subj_avg || '/5';
      END IF;
      IF issues_sentence <> '' THEN
        subj_parent_section := subj_parent_section || E'\n· 학습 포인트: ' || issues_sentence;
      END IF;
      IF hw_sentence <> '' THEN
        subj_parent_section := subj_parent_section || E'\n· ' || hw_sentence;
      END IF;
      IF subj_next_plan IS NOT NULL AND subj_next_plan <> '' THEN
        subj_parent_section := subj_parent_section || E'\n· 다음 주 계획: ' || subj_next_plan;
      END IF;
      parent_msg := parent_msg || subj_parent_section || E'\n\n';
    END LOOP;

    FOR test_rec IN
      SELECT lr.test_date, lr.subject::text AS subject_txt, lr.test_name, lr.test_result_text
      FROM public.lesson_records lr
      WHERE lr.student_id = s.id
        AND lr.lesson_date BETWEEN _week_start AND _week_end
        AND lr.submitted = true
        AND lr.test_result_text IS NOT NULL
        AND lr.test_result_text <> ''
    LOOP
      test_sentence := '· 시험: ';
      IF test_rec.test_date IS NOT NULL THEN
        test_sentence := test_sentence || to_char(test_rec.test_date, 'MM/DD') || ' ';
      END IF;
      test_sentence := test_sentence || test_rec.subject_txt;
      IF test_rec.test_name IS NOT NULL AND test_rec.test_name <> '' THEN
        test_sentence := test_sentence || ' ' || test_rec.test_name;
      END IF;
      test_sentence := test_sentence || ' - ' || test_rec.test_result_text;
      parent_msg := parent_msg || test_sentence || E'\n';
    END LOOP;

    IF array_length(hyugang_lines, 1) > 0 THEN
      hyugang_section := E'\n📌 휴강:\n' || array_to_string(hyugang_lines, E'\n');
      parent_msg := parent_msg || hyugang_section || E'\n';
    END IF;

    IF array_length(exception_lines, 1) > 0 THEN
      exception_section := E'\n📌 이번 주 특이사항:\n' || array_to_string(exception_lines, E'\n');
      parent_msg := parent_msg || exception_section || E'\n';
    END IF;

    IF prev_avg IS NOT NULL AND avg_under IS NOT NULL THEN
      IF avg_under > prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 향상되었습니다.';
      ELSIF avg_under < prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 다소 낮아졌습니다.';
      ELSE
        comparison_sentence := '지난주와 비슷한 이해도를 유지하고 있습니다.';
      END IF;
    END IF;

    student_msg := '[더멘토] ' || student_name_v || ' 주간리포트 (' || week_range_txt || ')' || E'\n\n' || student_msg;
    IF comparison_sentence <> '' THEN
      student_msg := student_msg || E'\n' || comparison_sentence;
    END IF;
    
    parent_msg := '[더멘토] ' || student_name_v || ' 주간 학습 리포트 (' || week_range_txt || ')' || E'\n\n' || parent_msg;
    IF comparison_sentence <> '' THEN
      parent_msg := parent_msg || comparison_sentence;
    END IF;

    INSERT INTO public.weekly_reports (
      student_id, week_start, week_end, total_lessons, avg_understanding,
      homework_completion_rate, common_issues, risk_level, 
      student_message, parent_message, generated_at,
      subject_breakdown
    ) VALUES (
      s.id, _week_start, _week_end, total_lessons_i, avg_under,
      CASE WHEN (completed_cnt + partial_cnt + not_done_cnt) > 0 
           THEN (completed_cnt::NUMERIC / (completed_cnt + partial_cnt + not_done_cnt) * 100)::NUMERIC(5,2)
           ELSE NULL END,
      issues, risk_txt,
      student_msg, parent_msg, now(),
      breakdown
    )
    ON CONFLICT (student_id, week_start) 
    DO UPDATE SET
      week_end = EXCLUDED.week_end,
      total_lessons = EXCLUDED.total_lessons,
      avg_understanding = EXCLUDED.avg_understanding,
      homework_completion_rate = EXCLUDED.homework_completion_rate,
      common_issues = EXCLUDED.common_issues,
      risk_level = EXCLUDED.risk_level,
      student_message = EXCLUDED.student_message,
      parent_message = EXCLUDED.parent_message,
      generated_at = EXCLUDED.generated_at,
      subject_breakdown = EXCLUDED.subject_breakdown;
  END LOOP;
END;
$function$;
