-- Update generate_weekly_reports to accept optional student_ids array
-- If student_ids is provided, only generate for those students
-- Otherwise, generate for all students (existing behavior)

CREATE OR REPLACE FUNCTION public.generate_weekly_reports(_week_start DATE, _week_end DATE, _student_ids UUID[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Check if user is admin
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only admins can generate weekly reports';
  END IF;

  week_range_txt := to_char(_week_start, 'MM/DD') || '~' || to_char(_week_end, 'MM/DD');

  -- Query students: if _student_ids is provided, filter by those IDs
  FOR s IN 
    SELECT id, name 
    FROM public.students 
    WHERE (_student_ids IS NULL OR id = ANY(_student_ids))
  LOOP
    student_name_v := s.name;
    breakdown := '[]'::jsonb;
    student_msg := '';
    parent_msg := '';
    comparison_sentence := '';
    exception_lines := '{}';
    hyugang_lines := '{}';
    
    -- Get previous report for comparison
    SELECT wr.avg_understanding, wr.total_lessons, wr.common_issues
    INTO prev_avg, prev_lessons, prev_issues
    FROM public.weekly_reports wr
    WHERE wr.student_id = s.id
      AND wr.week_start < _week_start
    ORDER BY wr.week_start DESC
    LIMIT 1;
    
    -- Aggregate lesson data
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

    -- Calculate risk score
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

    -- Build subject breakdown and messages
    FOR subj_name IN 
      SELECT DISTINCT subject FROM public.lesson_records 
      WHERE student_id = s.id AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true
    LOOP
      SELECT 
        COUNT(*)::INT,
        AVG(CASE WHEN NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN understanding_score ELSE NULL END)::NUMERIC(3,2),
        COALESCE(SUM(CASE WHEN homework_status='completed' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='partial' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='not_done' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE((SELECT ARRAY(SELECT unnest(learning_issues) FROM public.lesson_records WHERE student_id=s.id AND subject=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) LIMIT 2)), '{}'),
        (SELECT next_lesson_goal FROM public.lesson_records WHERE student_id=s.id AND subject=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) ORDER BY lesson_date DESC LIMIT 1)
      INTO subj_lessons, subj_avg, subj_completed, subj_partial, subj_not_done, subj_issues, subj_next_plan
      FROM public.lesson_records
      WHERE student_id = s.id AND subject = subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true;

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

      -- Build homework sentence
      IF subj_completed > 0 AND subj_not_done = 0 AND subj_partial = 0 THEN
        hw_sentence := '숙제 완료율 100%';
      ELSIF subj_not_done > 0 THEN
        hw_sentence := '숙제 미완료 ' || subj_not_done || '회';
      ELSE
        hw_sentence := '';
      END IF;

      -- Build issues sentence  
      IF array_length(subj_issues, 1) > 0 THEN
        issues_sentence := array_to_string(subj_issues, ', ');
      ELSE
        issues_sentence := '';
      END IF;

      -- Student section
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

      -- Parent section
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

    -- Add comparison to previous week
    IF prev_avg IS NOT NULL AND avg_under IS NOT NULL THEN
      IF avg_under > prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 향상되었습니다.';
      ELSIF avg_under < prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 다소 낮아졌습니다.';
      ELSE
        comparison_sentence := '지난주와 비슷한 이해도를 유지하고 있습니다.';
      END IF;
    END IF;

    -- Finalize messages
    student_msg := '[더멘토] ' || student_name_v || ' 주간리포트 (' || week_range_txt || ')' || E'\n\n' || student_msg;
    IF comparison_sentence <> '' THEN
      student_msg := student_msg || E'\n' || comparison_sentence;
    END IF;
    
    parent_msg := '[더멘토] ' || student_name_v || ' 주간 학습 리포트 (' || week_range_txt || ')' || E'\n\n' || parent_msg;
    IF comparison_sentence <> '' THEN
      parent_msg := parent_msg || comparison_sentence;
    END IF;

    -- Upsert into weekly_reports (idempotent - updates existing row if exists)
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
$$;

-- Also update generate_weekly_reports_scheduled to support student_ids
CREATE OR REPLACE FUNCTION public.generate_weekly_reports_scheduled(_week_start DATE, _week_end DATE, _student_ids UUID[] DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- No authorization check - this is for scheduled/edge function execution only

  week_range_txt := to_char(_week_start, 'MM/DD') || '~' || to_char(_week_end, 'MM/DD');

  -- Query students: if _student_ids is provided, filter by those IDs
  FOR s IN 
    SELECT id, name 
    FROM public.students 
    WHERE (_student_ids IS NULL OR id = ANY(_student_ids))
  LOOP
    student_name_v := s.name;
    breakdown := '[]'::jsonb;
    student_msg := '';
    parent_msg := '';
    comparison_sentence := '';
    exception_lines := '{}';
    hyugang_lines := '{}';
    
    -- Get previous report for comparison
    SELECT wr.avg_understanding, wr.total_lessons, wr.common_issues
    INTO prev_avg, prev_lessons, prev_issues
    FROM public.weekly_reports wr
    WHERE wr.student_id = s.id
      AND wr.week_start < _week_start
    ORDER BY wr.week_start DESC
    LIMIT 1;
    
    -- Aggregate lesson data
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

    -- Calculate risk score
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

    -- Build subject breakdown and messages
    FOR subj_name IN 
      SELECT DISTINCT subject FROM public.lesson_records 
      WHERE student_id = s.id AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true
    LOOP
      SELECT 
        COUNT(*)::INT,
        AVG(CASE WHEN NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN understanding_score ELSE NULL END)::NUMERIC(3,2),
        COALESCE(SUM(CASE WHEN homework_status='completed' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='partial' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE(SUM(CASE WHEN homework_status='not_done' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
        COALESCE((SELECT ARRAY(SELECT unnest(learning_issues) FROM public.lesson_records WHERE student_id=s.id AND subject=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) LIMIT 2)), '{}'),
        (SELECT next_lesson_goal FROM public.lesson_records WHERE student_id=s.id AND subject=subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted=true AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) ORDER BY lesson_date DESC LIMIT 1)
      INTO subj_lessons, subj_avg, subj_completed, subj_partial, subj_not_done, subj_issues, subj_next_plan
      FROM public.lesson_records
      WHERE student_id = s.id AND subject = subj_name AND lesson_date BETWEEN _week_start AND _week_end AND submitted = true;

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

      -- Build homework sentence
      IF subj_completed > 0 AND subj_not_done = 0 AND subj_partial = 0 THEN
        hw_sentence := '숙제 완료율 100%';
      ELSIF subj_not_done > 0 THEN
        hw_sentence := '숙제 미완료 ' || subj_not_done || '회';
      ELSE
        hw_sentence := '';
      END IF;

      -- Build issues sentence  
      IF array_length(subj_issues, 1) > 0 THEN
        issues_sentence := array_to_string(subj_issues, ', ');
      ELSE
        issues_sentence := '';
      END IF;

      -- Student section
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

      -- Parent section
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

    -- Add comparison to previous week
    IF prev_avg IS NOT NULL AND avg_under IS NOT NULL THEN
      IF avg_under > prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 향상되었습니다.';
      ELSIF avg_under < prev_avg THEN
        comparison_sentence := '지난주 대비 이해도가 다소 낮아졌습니다.';
      ELSE
        comparison_sentence := '지난주와 비슷한 이해도를 유지하고 있습니다.';
      END IF;
    END IF;

    -- Finalize messages
    student_msg := '[더멘토] ' || student_name_v || ' 주간리포트 (' || week_range_txt || ')' || E'\n\n' || student_msg;
    IF comparison_sentence <> '' THEN
      student_msg := student_msg || E'\n' || comparison_sentence;
    END IF;
    
    parent_msg := '[더멘토] ' || student_name_v || ' 주간 학습 리포트 (' || week_range_txt || ')' || E'\n\n' || parent_msg;
    IF comparison_sentence <> '' THEN
      parent_msg := parent_msg || comparison_sentence;
    END IF;

    -- Upsert into weekly_reports (idempotent - updates existing row if exists)
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
$$;