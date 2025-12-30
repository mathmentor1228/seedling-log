-- Update generate_weekly_reports to generate student_message and parent_message
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
  latest_goal TEXT;
  student_name_v TEXT;
  week_range_txt TEXT;
  understanding_stars TEXT;
  hw_summary TEXT;
  issues_text TEXT;
  top_issue TEXT;
BEGIN
  -- Format week range for messages
  week_range_txt := to_char(_week_start, 'MM/DD') || ' ~ ' || to_char(_week_end, 'MM/DD');

  FOR s IN SELECT id, name FROM public.students LOOP
    student_name_v := s.name;
    
    -- Only count submitted lessons (submitted = true)
    SELECT
      COUNT(*)::INT,
      AVG(understanding_score)::NUMERIC(3,2),
      COALESCE(SUM(CASE WHEN homework_status = 'not_done' THEN 1 ELSE 0 END),0)::INT,
      COALESCE(SUM(CASE WHEN homework_status = 'partial' THEN 1 ELSE 0 END),0)::INT,
      COALESCE(SUM(CASE WHEN homework_status = 'completed' THEN 1 ELSE 0 END),0)::INT,
      COALESCE((
        SELECT SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END)
        FROM public.attendance a
        WHERE a.student_id = s.id AND a.att_date BETWEEN _week_start AND _week_end
      ),0)::INT,
      COALESCE((
        SELECT ARRAY(
          SELECT issue
          FROM (
            SELECT unnest(lr2.learning_issues) AS issue, COUNT(*) cnt
            FROM public.lesson_records lr2
            WHERE lr2.student_id = s.id 
              AND lr2.lesson_date BETWEEN _week_start AND _week_end
              AND lr2.submitted = true
            GROUP BY 1
            ORDER BY cnt DESC
            LIMIT 2
          ) t
        )
      ),'{}'::TEXT[])
    INTO total_lessons_i, avg_under, not_done_cnt, partial_cnt, completed_cnt, absent_cnt, issues
    FROM public.lesson_records lr
    WHERE lr.student_id = s.id
      AND lr.lesson_date BETWEEN _week_start AND _week_end
      AND lr.submitted = true;

    -- Handle NULL total_lessons_i
    total_lessons_i := COALESCE(total_lessons_i, 0);

    -- Get latest next_lesson_goal
    SELECT next_lesson_goal INTO latest_goal
    FROM public.lesson_records
    WHERE student_id = s.id
      AND lesson_date BETWEEN _week_start AND _week_end
      AND submitted = true
      AND next_lesson_goal IS NOT NULL
      AND next_lesson_goal != ''
    ORDER BY lesson_date DESC
    LIMIT 1;

    -- Set messages for 0 submitted lessons
    IF total_lessons_i = 0 THEN
      student_msg := '이번 주 수업기록 미제출로 리포트 반영이 제한됩니다.';
      parent_msg := '이번 주 수업기록 미제출로 리포트 반영이 제한됩니다.';
      risk_txt := 'low';
    ELSE
      -- Calculate risk score: understanding<=2 = +3, not_done per +1, absent per +2
      risk_score := 0;
      IF avg_under IS NOT NULL AND avg_under <= 2 THEN risk_score := risk_score + 3; END IF;
      risk_score := risk_score + not_done_cnt;
      risk_score := risk_score + (absent_cnt * 2);

      IF risk_score >= 5 THEN risk_txt := 'high';
      ELSIF risk_score >= 3 THEN risk_txt := 'medium';
      ELSE risk_txt := 'low';
      END IF;

      -- Build understanding stars
      IF avg_under IS NOT NULL THEN
        understanding_stars := CASE 
          WHEN avg_under >= 4.5 THEN '⭐⭐⭐⭐⭐'
          WHEN avg_under >= 3.5 THEN '⭐⭐⭐⭐'
          WHEN avg_under >= 2.5 THEN '⭐⭐⭐'
          WHEN avg_under >= 1.5 THEN '⭐⭐'
          ELSE '⭐'
        END;
      ELSE
        understanding_stars := '-';
      END IF;

      -- Build homework summary
      hw_summary := '완료 ' || completed_cnt || '건 / 부분완료 ' || partial_cnt || '건 / 미완료 ' || not_done_cnt || '건';

      -- Build issues text
      IF array_length(issues, 1) > 0 THEN
        issues_text := array_to_string(issues, ', ');
        top_issue := issues[1];
      ELSE
        issues_text := '없음';
        top_issue := NULL;
      END IF;

      -- Build student message (warm coaching tone, short)
      student_msg := '[' || week_range_txt || ' 학습 리포트]' || E'\n' ||
        student_name_v || '님, 이번 주도 수고했어요! 💪' || E'\n\n';
      
      -- Add praise based on performance
      IF avg_under IS NOT NULL AND avg_under >= 4 THEN
        student_msg := student_msg || '✨ 이해도가 높아서 정말 잘하고 있어요!' || E'\n';
      ELSIF completed_cnt > not_done_cnt THEN
        student_msg := student_msg || '✨ 숙제를 열심히 해와서 좋았어요!' || E'\n';
      ELSE
        student_msg := student_msg || '✨ 꾸준히 수업에 참여해줘서 고마워요!' || E'\n';
      END IF;

      -- Add improvement suggestion
      IF not_done_cnt > 0 THEN
        student_msg := student_msg || '📝 숙제 완료율을 조금 더 높여보아요!' || E'\n';
      ELSIF avg_under IS NOT NULL AND avg_under < 3 THEN
        student_msg := student_msg || '📝 어려운 부분은 질문해서 해결해봐요!' || E'\n';
      END IF;

      -- Add top issues as emoji bullets
      IF array_length(issues, 1) > 0 THEN
        student_msg := student_msg || E'\n' || '📌 체크포인트:' || E'\n';
        FOR i IN 1..LEAST(array_length(issues, 1), 2) LOOP
          student_msg := student_msg || '  • ' || issues[i] || E'\n';
        END LOOP;
      END IF;

      -- Add next mission
      student_msg := student_msg || E'\n' || '🎯 다음 주 미션: ';
      IF latest_goal IS NOT NULL AND latest_goal != '' THEN
        student_msg := student_msg || latest_goal;
      ELSIF top_issue IS NOT NULL THEN
        student_msg := student_msg || top_issue || ' 보완하기';
      ELSE
        student_msg := student_msg || '복습 열심히 하기';
      END IF;
      
      student_msg := student_msg || E'\n\n' || '다음 주도 화이팅! 🔥';

      -- Build parent message (summary + numbers)
      parent_msg := '[' || week_range_txt || ' 주간 학습 리포트]' || E'\n' ||
        '학생: ' || student_name_v || E'\n\n' ||
        '📊 이번 주 요약' || E'\n' ||
        '• 수업 횟수: ' || total_lessons_i || '회' || E'\n' ||
        '• 평균 이해도: ' || understanding_stars || ' (' || COALESCE(round(avg_under, 1)::text, '-') || '/5)' || E'\n' ||
        '• 숙제 현황: ' || hw_summary || E'\n';

      IF absent_cnt > 0 THEN
        parent_msg := parent_msg || '• 결석: ' || absent_cnt || '회' || E'\n';
      END IF;

      parent_msg := parent_msg || E'\n' || '📝 학습 이슈' || E'\n';
      IF array_length(issues, 1) > 0 THEN
        parent_msg := parent_msg || '이번 주 주요 체크포인트는 ' || issues_text || ' 입니다. ';
        IF array_length(issues, 1) > 1 THEN
          parent_msg := parent_msg || '특히 ' || issues[1] || ' 부분을 집중적으로 보완할 예정입니다.';
        END IF;
      ELSE
        parent_msg := parent_msg || '이번 주 특별한 학습 이슈는 없습니다. 잘 따라오고 있습니다.';
      END IF;

      parent_msg := parent_msg || E'\n\n' || '📅 다음 주 계획' || E'\n';
      IF latest_goal IS NOT NULL AND latest_goal != '' THEN
        parent_msg := parent_msg || latest_goal;
      ELSE
        parent_msg := parent_msg || '이번 주 학습 내용 복습 및 심화';
      END IF;

      parent_msg := parent_msg || E'\n\n' || '문의사항은 학원으로 연락 부탁드립니다.';
    END IF;

    INSERT INTO public.weekly_reports (
      student_id, week_start, week_end,
      total_lessons, avg_understanding,
      common_issues, risk_level, summary, 
      student_message, parent_message,
      student_sent_status, parent_sent_status,
      generated_at
    ) VALUES (
      s.id, _week_start, _week_end,
      total_lessons_i, avg_under,
      issues, risk_txt, NULL,
      student_msg, parent_msg,
      'draft', 'draft',
      now()
    )
    ON CONFLICT (student_id, week_start)
    DO UPDATE SET
      week_end = EXCLUDED.week_end,
      total_lessons = EXCLUDED.total_lessons,
      avg_understanding = EXCLUDED.avg_understanding,
      common_issues = EXCLUDED.common_issues,
      risk_level = EXCLUDED.risk_level,
      summary = EXCLUDED.summary,
      student_message = EXCLUDED.student_message,
      parent_message = EXCLUDED.parent_message,
      student_sent_status = 'draft',
      parent_sent_status = 'draft',
      generated_at = now();
  END LOOP;
END;
$function$;