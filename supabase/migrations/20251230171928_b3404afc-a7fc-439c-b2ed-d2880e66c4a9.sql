-- Add subject_breakdown JSONB column to weekly_reports
ALTER TABLE public.weekly_reports
ADD COLUMN IF NOT EXISTS subject_breakdown JSONB DEFAULT '[]'::jsonb;

-- Drop and recreate the function with subject-based breakdown
CREATE OR REPLACE FUNCTION public.generate_weekly_reports(_week_start date, _week_end date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  s RECORD;
  subj RECORD;
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
  subj_order TEXT[] := ARRAY['수학', '과학', '영어', '국어'];
  subj_data RECORD;
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
BEGIN
  -- Format week range for messages
  week_range_txt := to_char(_week_start, 'MM/DD') || '~' || to_char(_week_end, 'MM/DD');

  FOR s IN SELECT id, name FROM public.students LOOP
    student_name_v := s.name;
    
    -- Initialize breakdown
    breakdown := '[]'::jsonb;
    student_msg := '';
    parent_msg := '';
    
    -- Calculate overall totals (only submitted lessons)
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

    total_lessons_i := COALESCE(total_lessons_i, 0);

    -- For 0 lessons, set fallback messages
    IF total_lessons_i = 0 THEN
      student_msg := '이번 주 수업기록 미제출로 리포트 반영이 제한됩니다.';
      parent_msg := '이번 주 수업기록 미제출로 리포트 반영이 제한됩니다.';
      risk_txt := 'low';
    ELSE
      -- Calculate risk score
      risk_score := 0;
      IF avg_under IS NOT NULL AND avg_under <= 2 THEN risk_score := risk_score + 3; END IF;
      risk_score := risk_score + not_done_cnt;
      risk_score := risk_score + (absent_cnt * 2);

      IF risk_score >= 5 THEN risk_txt := 'high';
      ELSIF risk_score >= 3 THEN risk_txt := 'medium';
      ELSE risk_txt := 'low';
      END IF;

      -- Build messages by subject
      -- Parent message header
      parent_msg := '[더멘토] ' || student_name_v || ' 주간 학습 리포트 (' || week_range_txt || ')' || E'\n\n';
      
      -- Student message header  
      student_msg := '[더멘토] 이번 주 체크 (' || week_range_txt || ')' || E'\n\n';

      -- Process each subject in order
      FOREACH subj_data IN ARRAY subj_order LOOP
        -- Get subject-specific data
        SELECT
          COUNT(*)::INT,
          AVG(understanding_score)::NUMERIC(3,2),
          COALESCE(SUM(CASE WHEN homework_status = 'completed' THEN 1 ELSE 0 END),0)::INT,
          COALESCE(SUM(CASE WHEN homework_status = 'partial' THEN 1 ELSE 0 END),0)::INT,
          COALESCE(SUM(CASE WHEN homework_status = 'not_done' THEN 1 ELSE 0 END),0)::INT
        INTO subj_lessons, subj_avg, subj_completed, subj_partial, subj_not_done
        FROM public.lesson_records lr
        WHERE lr.student_id = s.id
          AND lr.lesson_date BETWEEN _week_start AND _week_end
          AND lr.submitted = true
          AND lr.subject = subj_data;

        subj_lessons := COALESCE(subj_lessons, 0);

        -- Skip if no lessons for this subject
        IF subj_lessons > 0 THEN
          -- Get top issues for this subject
          SELECT COALESCE(ARRAY(
            SELECT issue
            FROM (
              SELECT unnest(lr2.learning_issues) AS issue, COUNT(*) cnt
              FROM public.lesson_records lr2
              WHERE lr2.student_id = s.id 
                AND lr2.lesson_date BETWEEN _week_start AND _week_end
                AND lr2.submitted = true
                AND lr2.subject = subj_data
              GROUP BY 1
              ORDER BY cnt DESC
              LIMIT 2
            ) t
          ), '{}'::TEXT[])
          INTO subj_issues;

          -- Get next lesson goal for this subject
          SELECT next_lesson_goal INTO subj_next_plan
          FROM public.lesson_records
          WHERE student_id = s.id
            AND lesson_date BETWEEN _week_start AND _week_end
            AND submitted = true
            AND subject = subj_data
            AND next_lesson_goal IS NOT NULL
            AND next_lesson_goal != ''
          ORDER BY lesson_date DESC
          LIMIT 1;

          -- Build homework summary sentence
          IF subj_completed + subj_partial + subj_not_done = 0 THEN
            hw_sentence := '과제 없음';
          ELSE
            hw_sentence := '완료 ' || subj_completed || '건';
            IF subj_partial > 0 THEN
              hw_sentence := hw_sentence || ', 부분완료 ' || subj_partial || '건';
            END IF;
            IF subj_not_done > 0 THEN
              hw_sentence := hw_sentence || ', 미완료 ' || subj_not_done || '건';
            END IF;
          END IF;

          -- Build issues sentence
          IF array_length(subj_issues, 1) > 0 THEN
            issues_sentence := array_to_string(subj_issues, ', ') || ' 부분 집중 필요';
          ELSE
            issues_sentence := '전반적으로 잘 따라오고 있습니다';
          END IF;

          -- Add to breakdown JSONB
          breakdown := breakdown || jsonb_build_object(
            'subject', subj_data,
            'lessons_count', subj_lessons,
            'avg_understanding', subj_avg,
            'homework', jsonb_build_object(
              'completed', subj_completed,
              'partial', subj_partial,
              'not_done', subj_not_done
            ),
            'top_issues', subj_issues,
            'next_plan', COALESCE(subj_next_plan, '')
          );

          -- Build parent section
          subj_parent_section := '■ ' || subj_data || ' (' || subj_lessons || '회 / 평균 이해도 ' || COALESCE(round(subj_avg, 1)::text, '-') || '/5)' || E'\n';
          subj_parent_section := subj_parent_section || '- 과제: ' || hw_sentence || E'\n';
          subj_parent_section := subj_parent_section || '- 학습 포인트: ' || issues_sentence || E'\n';
          IF subj_next_plan IS NOT NULL AND subj_next_plan != '' THEN
            subj_parent_section := subj_parent_section || '- 다음 주 방향: ' || subj_next_plan || E'\n';
          END IF;
          subj_parent_section := subj_parent_section || E'\n';
          
          parent_msg := parent_msg || subj_parent_section;

          -- Build student section
          subj_student_section := '■ ' || subj_data || E'\n';
          IF subj_avg >= 4 THEN
            subj_student_section := subj_student_section || '이번 주 정말 잘했어요! 🙂' || E'\n';
          ELSIF subj_avg >= 3 THEN
            subj_student_section := subj_student_section || '이번 주도 잘 따라왔어요 🙂' || E'\n';
          ELSE
            subj_student_section := subj_student_section || '조금 어려웠지만 끝까지 수고했어요 💪' || E'\n';
          END IF;
          
          IF array_length(subj_issues, 1) > 0 THEN
            subj_student_section := subj_student_section || '포인트: ' || array_to_string(subj_issues, ', ') || E'\n';
          END IF;
          
          IF subj_next_plan IS NOT NULL AND subj_next_plan != '' THEN
            subj_student_section := subj_student_section || '다음 미션: ' || subj_next_plan || E'\n';
          ELSIF array_length(subj_issues, 1) > 0 THEN
            subj_student_section := subj_student_section || '다음 미션: ' || subj_issues[1] || ' 복습하기' || E'\n';
          ELSE
            subj_student_section := subj_student_section || '다음 미션: 복습 열심히 하기' || E'\n';
          END IF;
          subj_student_section := subj_student_section || E'\n';
          
          student_msg := student_msg || subj_student_section;
        END IF;
      END LOOP;

      -- Add closing lines
      parent_msg := parent_msg || '담당 선생님과 함께 학습 흐름을 지속 점검하겠습니다.';
      student_msg := student_msg || '다음 주도 화이팅! 🔥';
    END IF;

    INSERT INTO public.weekly_reports (
      student_id, week_start, week_end,
      total_lessons, avg_understanding,
      common_issues, risk_level, summary, 
      student_message, parent_message,
      student_sent_status, parent_sent_status,
      subject_breakdown,
      generated_at
    ) VALUES (
      s.id, _week_start, _week_end,
      total_lessons_i, avg_under,
      issues, risk_txt, NULL,
      student_msg, parent_msg,
      'draft', 'draft',
      breakdown,
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
      subject_breakdown = EXCLUDED.subject_breakdown,
      generated_at = now();
  END LOOP;
END;
$function$;