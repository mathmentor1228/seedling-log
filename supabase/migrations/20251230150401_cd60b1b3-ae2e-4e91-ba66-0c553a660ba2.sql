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
  absent_cnt INT;
  risk_score INT;
  risk_txt TEXT;
  issues TEXT[];
  summary_txt TEXT;
BEGIN
  FOR s IN SELECT id FROM public.students LOOP
    -- Only count submitted lessons
    SELECT
      COUNT(*)::INT,
      AVG(understanding_score)::NUMERIC(3,2),
      COALESCE(SUM(CASE WHEN homework_status = 'not_done' THEN 1 ELSE 0 END),0)::INT,
      COALESCE((
        SELECT SUM(CASE WHEN status='absent' THEN 1 ELSE 0 END)
        FROM public.attendance a
        WHERE a.student_id = s.id AND a.att_date BETWEEN _week_start AND _week_end
      ),0)::INT,
      COALESCE((
        SELECT ARRAY(
          SELECT issue
          FROM (
            SELECT unnest(lr.learning_issues) AS issue, COUNT(*) cnt
            FROM public.lesson_records lr
            WHERE lr.student_id = s.id 
              AND lr.lesson_date BETWEEN _week_start AND _week_end
              AND lr.submitted = true
            GROUP BY 1
            ORDER BY cnt DESC
            LIMIT 2
          ) t
        )
      ),'{}'::TEXT[])
    INTO total_lessons_i, avg_under, not_done_cnt, absent_cnt, issues
    FROM public.lesson_records lr
    WHERE lr.student_id = s.id
      AND lr.lesson_date BETWEEN _week_start AND _week_end
      AND lr.submitted = true;

    -- Handle NULL total_lessons_i
    total_lessons_i := COALESCE(total_lessons_i, 0);

    -- Set summary for 0 submitted lessons
    IF total_lessons_i = 0 THEN
      summary_txt := '이번 주 수업기록이 제출되지 않아 리포트 반영이 제한됩니다.';
      risk_txt := NULL;
    ELSE
      summary_txt := NULL;
      
      -- Calculate risk score: understanding<=2 = +3, not_done per +1, absent per +2
      risk_score := 0;
      IF avg_under IS NOT NULL AND avg_under <= 2 THEN risk_score := risk_score + 3; END IF;
      risk_score := risk_score + not_done_cnt;
      risk_score := risk_score + (absent_cnt * 2);

      IF risk_score >= 5 THEN risk_txt := 'high';
      ELSIF risk_score >= 3 THEN risk_txt := 'medium';
      ELSE risk_txt := 'low';
      END IF;
    END IF;

    INSERT INTO public.weekly_reports (
      student_id, week_start, week_end,
      total_lessons, avg_understanding,
      common_issues, risk_level, summary, generated_at
    ) VALUES (
      s.id, _week_start, _week_end,
      total_lessons_i, avg_under,
      issues, risk_txt, summary_txt, now()
    )
    ON CONFLICT (student_id, week_start)
    DO UPDATE SET
      week_end = EXCLUDED.week_end,
      total_lessons = EXCLUDED.total_lessons,
      avg_understanding = EXCLUDED.avg_understanding,
      common_issues = EXCLUDED.common_issues,
      risk_level = EXCLUDED.risk_level,
      summary = EXCLUDED.summary,
      generated_at = now();
  END LOOP;
END;
$function$;