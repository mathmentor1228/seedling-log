-- Fix generate_weekly_reports to add authorization check at start
CREATE OR REPLACE FUNCTION public.generate_weekly_reports(_week_start date, _week_end date)
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
  -- Week-over-week comparison variables
  prev_report RECORD;
  prev_avg NUMERIC(3,2);
  prev_lessons INT;
  prev_issues TEXT[];
  comparison_sentence TEXT;
  issue_repeat_cnt INT;
  -- Test variables
  test_rec RECORD;
  test_sentence TEXT;
  -- Exception variables for 이번 주 특이사항
  exception_rec RECORD;
  exception_lines TEXT[];
  exception_section TEXT;
  -- 휴강 variables
  hyugang_rec RECORD;
  hyugang_lines TEXT[];
  hyugang_section TEXT;
BEGIN
  -- Authorization check: only admin can generate reports
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Only administrators can generate weekly reports';
  END IF;

  week_range_txt := to_char(_week_start, 'MM/DD') || '~' || to_char(_week_end, 'MM/DD');

  FOR s IN SELECT id, name FROM public.students LOOP
    student_name_v := s.name;
    breakdown := '[]'::jsonb;
    student_msg := '';
    parent_msg := '';
    comparison_sentence := '';
    exception_lines := '{}';
    hyugang_lines := '{}';
    
    -- Fetch previous week's report for comparison
    SELECT wr.avg_understanding, wr.total_lessons, wr.common_issues
    INTO prev_avg, prev_lessons, prev_issues
    FROM public.weekly_reports wr
    WHERE wr.student_id = s.id
      AND wr.week_start < _week_start
    ORDER BY wr.week_start DESC
    LIMIT 1;
    
    -- Calculate overall totals (excluding 휴강 records for scoring)
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

    -- Build 휴강 lines
    FOR hyugang_rec IN
      SELECT 
        lr.lesson_date,
        lr.subject
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
        hyugang_lines := array_append(hyugang_lines, date_txt || ' ' || hyugang_rec.subject || ' 휴강');
      END;
    END LOOP;

    -- Build exception lines for 이번 주 특이사항 (excluding 휴강 which is handled separately)
    FOR exception_rec IN
      SELECT 
        lr.lesson_date,
        lr.subject,
        lr.lesson_types,
        lr.attendance_status
      FROM public.lesson_records lr
      WHERE lr.student_id = s.id
        AND lr.lesson_date BETWEEN _week_start AND _week_end
        AND lr.submitted = true
        AND NOT ('휴강' = ANY(COALESCE(lr.lesson_types, '{}')))
        AND (
          (lr.attendance_status && ARRAY['지각', '조퇴', '인정결석', '무단결석', '보충불가'])
          OR
          (lr.lesson_types && ARRAY['보충수업', '시험특강', '방학특강', '공지사항'])
        )
      ORDER BY lr.lesson_date, lr.subject
    LOOP
      DECLARE
        exception_items TEXT[];
        item TEXT;
        line_txt TEXT;
        date_txt TEXT;
      BEGIN
        exception_items := '{}';
        date_txt := EXTRACT(MONTH FROM exception_rec.lesson_date)::TEXT || '월 ' || EXTRACT(DAY FROM exception_rec.lesson_date)::TEXT || '일';
        
        IF exception_rec.lesson_types IS NOT NULL THEN
          FOREACH item IN ARRAY exception_rec.lesson_types
          LOOP
            IF item IN ('보충수업', '시험특강', '방학특강', '공지사항') THEN
              exception_items := array_append(exception_items, item);
            END IF;
          END LOOP;
        END IF;
        
        IF exception_rec.attendance_status IS NOT NULL THEN
          FOREACH item IN ARRAY exception_rec.attendance_status
          LOOP
            IF item IN ('지각', '조퇴', '인정결석', '무단결석', '보충불가') THEN
              exception_items := array_append(exception_items, item);
            END IF;
          END LOOP;
        END IF;
        
        IF array_length(exception_items, 1) > 0 THEN
          line_txt := date_txt || ' ' || exception_rec.subject || ' ' || array_to_string(exception_items, ' / ');
          exception_lines := array_append(exception_lines, line_txt);
        END IF;
      END;
    END LOOP;

    IF total_lessons_i = 0 THEN
      student_msg := '이번 주 수업기록 미제출로 리포트 반영이 제한됩니다.';
      parent_msg := '이번 주 수업기록 미제출로 리포트 반영이 제한됩니다.';
      risk_txt := 'low';
    ELSE
      IF prev_avg IS NOT NULL AND prev_lessons IS NOT NULL THEN
        issue_repeat_cnt := 0;
        IF array_length(issues, 1) > 0 AND array_length(prev_issues, 1) > 0 THEN
          SELECT COUNT(*) INTO issue_repeat_cnt
          FROM unnest(issues) curr_issue
          WHERE curr_issue = ANY(prev_issues);
        END IF;
        
        IF avg_under > prev_avg + 0.3 THEN
          comparison_sentence := '📈 지난주 대비 학습 이해도가 향상되었습니다. 꾸준한 노력이 성과로 이어지고 있습니다.';
        ELSIF avg_under < prev_avg - 0.3 OR issue_repeat_cnt >= 2 THEN
          comparison_sentence := '📋 일부 학습 포인트에서 지속적인 관리가 필요합니다. 담당 선생님과 함께 보완해 나가겠습니다.';
        ELSE
          comparison_sentence := '📊 전반적으로 안정적인 학습 흐름을 유지하고 있습니다.';
        END IF;
      ELSE
        comparison_sentence := '📊 이번 주 첫 리포트입니다. 앞으로 매주 학습 현황을 안내드리겠습니다.';
      END IF;
      
      risk_score := 0;
      IF avg_under IS NOT NULL AND avg_under <= 2 THEN risk_score := risk_score + 3; END IF;
      risk_score := risk_score + not_done_cnt + (absent_cnt * 2);
      IF risk_score >= 5 THEN risk_txt := 'high';
      ELSIF risk_score >= 3 THEN risk_txt := 'medium';
      ELSE risk_txt := 'low'; END IF;

      parent_msg := '[더멘토] ' || student_name_v || ' 주간 학습 리포트 (' || week_range_txt || ')' || E'\n\n';
      parent_msg := parent_msg || comparison_sentence || E'\n\n';
      
      student_msg := '[더멘토] 이번 주 체크 (' || week_range_txt || ')' || E'\n\n';

      FOR subj_name IN SELECT unnest(ARRAY['수학', '과학', '영어', '국어']) LOOP
        SELECT
          COUNT(*)::INT,
          AVG(CASE WHEN NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN understanding_score ELSE NULL END)::NUMERIC(3,2),
          COALESCE(SUM(CASE WHEN homework_status = 'completed' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
          COALESCE(SUM(CASE WHEN homework_status = 'partial' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT,
          COALESCE(SUM(CASE WHEN homework_status = 'not_done' AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}'))) THEN 1 ELSE 0 END),0)::INT
        INTO subj_lessons, subj_avg, subj_completed, subj_partial, subj_not_done
        FROM public.lesson_records lr
        WHERE lr.student_id = s.id
          AND lr.lesson_date BETWEEN _week_start AND _week_end
          AND lr.submitted = true
          AND lr.subject::text = subj_name;

        subj_lessons := COALESCE(subj_lessons, 0);

        IF subj_lessons > 0 THEN
          SELECT COALESCE(ARRAY(
            SELECT issue FROM (
              SELECT unnest(lr2.learning_issues) AS issue, COUNT(*) cnt
              FROM public.lesson_records lr2
              WHERE lr2.student_id = s.id 
                AND lr2.lesson_date BETWEEN _week_start AND _week_end
                AND lr2.submitted = true
                AND lr2.subject::text = subj_name
                AND NOT ('휴강' = ANY(COALESCE(lr2.lesson_types, '{}')))
              GROUP BY 1 ORDER BY cnt DESC LIMIT 2
            ) t
          ), '{}'::TEXT[])
          INTO subj_issues;

          SELECT next_lesson_goal INTO subj_next_plan
          FROM public.lesson_records
          WHERE student_id = s.id
            AND lesson_date BETWEEN _week_start AND _week_end
            AND submitted = true
            AND subject::text = subj_name
            AND next_lesson_goal IS NOT NULL AND next_lesson_goal != ''
            AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}')))
          ORDER BY lesson_date DESC LIMIT 1;

          IF subj_completed + subj_partial + subj_not_done = 0 THEN
            hw_sentence := '과제 없음';
          ELSE
            hw_sentence := '완료 ' || subj_completed || '건';
            IF subj_partial > 0 THEN hw_sentence := hw_sentence || ', 부분완료 ' || subj_partial || '건'; END IF;
            IF subj_not_done > 0 THEN hw_sentence := hw_sentence || ', 미완료 ' || subj_not_done || '건'; END IF;
          END IF;

          IF array_length(subj_issues, 1) > 0 THEN
            issues_sentence := array_to_string(subj_issues, ', ') || ' 부분 집중 필요';
          ELSE
            issues_sentence := '전반적으로 잘 따라오고 있습니다';
          END IF;

          test_sentence := '';
          FOR test_rec IN
            SELECT test_name, test_result_text, test_result, test_date
            FROM public.lesson_records
            WHERE student_id = s.id
              AND lesson_date BETWEEN _week_start AND _week_end
              AND submitted = true
              AND subject::text = subj_name
              AND test_result_text IS NOT NULL
              AND test_result_text != ''
              AND NOT ('휴강' = ANY(COALESCE(lesson_types, '{}')))
            ORDER BY lesson_date
          LOOP
            IF test_sentence != '' THEN
              test_sentence := test_sentence || '; ';
            END IF;
            test_sentence := test_sentence || COALESCE(test_rec.test_name, '테스트') || ': ' || test_rec.test_result_text;
            IF subj_name = '영어' AND test_rec.test_result IN ('pass', 'fail') THEN
              IF test_rec.test_result = 'pass' THEN
                test_sentence := test_sentence || ' (통과)';
              ELSE
                test_sentence := test_sentence || ' (불통과)';
              END IF;
            END IF;
          END LOOP;

          breakdown := breakdown || jsonb_build_object(
            'subject', subj_name,
            'lessons_count', subj_lessons,
            'avg_understanding', subj_avg,
            'homework', jsonb_build_object('completed', subj_completed, 'partial', subj_partial, 'not_done', subj_not_done),
            'top_issues', subj_issues,
            'next_plan', COALESCE(subj_next_plan, ''),
            'test_results', CASE WHEN test_sentence != '' THEN test_sentence ELSE NULL END
          );

          subj_parent_section := '■ ' || subj_name || ' (' || subj_lessons || '회 / 평균 이해도 ' || COALESCE(round(subj_avg, 1)::text, '-') || '/5)' || E'\n';
          subj_parent_section := subj_parent_section || '- 과제: ' || hw_sentence || E'\n';
          subj_parent_section := subj_parent_section || '- 학습 포인트: ' || issues_sentence || E'\n';
          IF test_sentence != '' THEN
            subj_parent_section := subj_parent_section || '- 테스트: ' || test_sentence || E'\n';
          END IF;
          IF subj_next_plan IS NOT NULL AND subj_next_plan != '' THEN
            subj_parent_section := subj_parent_section || '- 다음 주 방향: ' || subj_next_plan || E'\n';
          END IF;
          parent_msg := parent_msg || subj_parent_section || E'\n';

          subj_student_section := '■ ' || subj_name || E'\n';
          IF subj_avg >= 4 THEN subj_student_section := subj_student_section || '이번 주 정말 잘했어요! 🙂' || E'\n';
          ELSIF subj_avg >= 3 THEN subj_student_section := subj_student_section || '이번 주도 잘 따라왔어요 🙂' || E'\n';
          ELSE subj_student_section := subj_student_section || '조금 어려웠지만 끝까지 수고했어요 💪' || E'\n'; END IF;
          
          IF array_length(subj_issues, 1) > 0 THEN
            subj_student_section := subj_student_section || '포인트: ' || array_to_string(subj_issues, ', ') || E'\n';
          END IF;
          IF test_sentence != '' THEN
            subj_student_section := subj_student_section || '테스트: ' || test_sentence || E'\n';
          END IF;
          
          IF subj_next_plan IS NOT NULL AND subj_next_plan != '' THEN
            subj_student_section := subj_student_section || '다음 미션: ' || subj_next_plan || E'\n';
          ELSIF array_length(subj_issues, 1) > 0 THEN
            subj_student_section := subj_student_section || '다음 미션: ' || subj_issues[1] || ' 복습하기' || E'\n';
          ELSE
            subj_student_section := subj_student_section || '다음 미션: 복습 열심히 하기' || E'\n';
          END IF;
          student_msg := student_msg || subj_student_section || E'\n';
        END IF;
      END LOOP;

      -- Add 휴강 section if any
      IF array_length(hyugang_lines, 1) > 0 THEN
        hyugang_section := '■ 휴강 안내' || E'\n';
        DECLARE
          hyugang_line TEXT;
        BEGIN
          FOREACH hyugang_line IN ARRAY hyugang_lines
          LOOP
            hyugang_section := hyugang_section || '- ' || hyugang_line || E'\n';
          END LOOP;
        END;
        parent_msg := parent_msg || hyugang_section || E'\n';
        student_msg := student_msg || '📅 ' || array_to_string(hyugang_lines, ', ') || E'\n\n';
      END IF;

      -- Add exception section to parent message if we have exceptions
      IF array_length(exception_lines, 1) > 0 THEN
        exception_section := '■ 이번 주 특이사항' || E'\n';
        DECLARE
          ex_line TEXT;
        BEGIN
          FOREACH ex_line IN ARRAY exception_lines
          LOOP
            exception_section := exception_section || '- ' || ex_line || E'\n';
          END LOOP;
        END;
        parent_msg := parent_msg || exception_section || E'\n';
        
        student_msg := student_msg || '📌 이번 주 체크사항' || E'\n';
        DECLARE
          ex_line TEXT;
        BEGIN
          FOREACH ex_line IN ARRAY exception_lines
          LOOP
            student_msg := student_msg || '  · ' || ex_line || E'\n';
          END LOOP;
        END;
        student_msg := student_msg || E'\n';
      END IF;

      parent_msg := parent_msg || '담당 선생님과 함께 학습 흐름을 지속 점검하겠습니다.';
      student_msg := student_msg || '다음 주도 화이팅! 🔥';
    END IF;

    INSERT INTO public.weekly_reports (
      student_id, week_start, week_end, total_lessons, avg_understanding,
      common_issues, risk_level, summary, student_message, parent_message,
      student_sent_status, parent_sent_status, subject_breakdown, generated_at
    ) VALUES (
      s.id, _week_start, _week_end, total_lessons_i, avg_under,
      issues, risk_txt, NULL, student_msg, parent_msg,
      'draft', 'draft', breakdown, now()
    )
    ON CONFLICT (student_id, week_start)
    DO UPDATE SET
      week_end = EXCLUDED.week_end, total_lessons = EXCLUDED.total_lessons,
      avg_understanding = EXCLUDED.avg_understanding, common_issues = EXCLUDED.common_issues,
      risk_level = EXCLUDED.risk_level, student_message = EXCLUDED.student_message,
      parent_message = EXCLUDED.parent_message, student_sent_status = 'draft',
      parent_sent_status = 'draft', subject_breakdown = EXCLUDED.subject_breakdown,
      generated_at = now();
  END LOOP;
END;
$function$;