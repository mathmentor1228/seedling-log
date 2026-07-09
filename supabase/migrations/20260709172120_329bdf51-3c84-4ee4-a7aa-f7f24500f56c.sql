
-- LESSON-RECORD-DEDUP-V2
-- 병합 중 partial unique index 충돌 방지를 위해 먼저 제거
DROP INDEX IF EXISTS public.idx_lesson_records_no_duplicate;

DO $$
DECLARE
  grp RECORD;
  winner_id UUID;
  loser_ids UUID[];
BEGIN
  FOR grp IN
    SELECT student_id, subject, lesson_date, array_agg(id) AS ids
    FROM public.lesson_records
    GROUP BY student_id, subject, lesson_date
    HAVING COUNT(*) > 1
  LOOP
    SELECT id INTO winner_id
    FROM public.lesson_records
    WHERE id = ANY(grp.ids)
    ORDER BY submitted DESC NULLS LAST, updated_at DESC NULLS LAST, created_at DESC NULLS LAST
    LIMIT 1;

    loser_ids := ARRAY(SELECT unnest(grp.ids) EXCEPT SELECT winner_id);

    -- 자식 FK 먼저 winner로 이관 (winner는 이미 자기 것 가지고 있으므로 loser들만)
    UPDATE public.homework_assignments SET lesson_record_id = winner_id WHERE lesson_record_id = ANY(loser_ids);
    UPDATE public.clinic_records SET lesson_record_id = winner_id WHERE lesson_record_id = ANY(loser_ids);
    UPDATE public.self_study_records SET lesson_record_id = winner_id WHERE lesson_record_id = ANY(loser_ids);
    UPDATE public.homework_alert_ack SET source_lesson_id = winner_id WHERE source_lesson_id = ANY(loser_ids);

    -- winner에 loser 정보 coalesce merge (loser별로 순회하며 채움)
    UPDATE public.lesson_records w SET
      class_id             = COALESCE(w.class_id, l.class_id),
      understanding_score  = COALESCE(w.understanding_score, l.understanding_score),
      next_lesson_goal     = COALESCE(NULLIF(w.next_lesson_goal, ''), l.next_lesson_goal),
      notes                = COALESCE(NULLIF(w.notes, ''), l.notes),
      test_name            = COALESCE(NULLIF(w.test_name, ''), l.test_name),
      test_content         = COALESCE(NULLIF(w.test_content, ''), l.test_content),
      test_result_text     = COALESCE(NULLIF(w.test_result_text, ''), l.test_result_text),
      test_result          = CASE WHEN w.test_result = 'none' AND l.test_result IS DISTINCT FROM 'none' THEN l.test_result ELSE w.test_result END,
      test_date            = COALESCE(w.test_date, l.test_date),
      test_assistant       = COALESCE(w.test_assistant, l.test_assistant),
      test_name_2          = COALESCE(NULLIF(w.test_name_2, ''), l.test_name_2),
      test_content_2       = COALESCE(NULLIF(w.test_content_2, ''), l.test_content_2),
      test_result_text_2   = COALESCE(NULLIF(w.test_result_text_2, ''), l.test_result_text_2),
      test_result_2        = CASE WHEN w.test_result_2 = 'none' AND l.test_result_2 IS DISTINCT FROM 'none' THEN l.test_result_2 ELSE w.test_result_2 END,
      test_date_2          = COALESCE(w.test_date_2, l.test_date_2),
      test_assistant_2     = COALESCE(w.test_assistant_2, l.test_assistant_2),
      english_pass_fail    = COALESCE(w.english_pass_fail, l.english_pass_fail),
      english_pass_fail_2  = COALESCE(w.english_pass_fail_2, l.english_pass_fail_2),
      english_grammar_unit = COALESCE(w.english_grammar_unit, l.english_grammar_unit),
      english_reading_units= COALESCE(w.english_reading_units, l.english_reading_units),
      korean_categories    = CASE WHEN COALESCE(array_length(w.korean_categories,1),0)=0 THEN l.korean_categories ELSE w.korean_categories END,
      homework_check_note  = COALESCE(NULLIF(w.homework_check_note, ''), l.homework_check_note),
      lesson_types         = (
        SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(w.lesson_types,'{}'::text[]) || COALESCE(l.lesson_types,'{}'::text[])))
      ),
      attendance_status    = CASE
        WHEN COALESCE(array_length(w.attendance_status,1),0)=0 THEN l.attendance_status
        ELSE w.attendance_status END,
      submitted            = w.submitted OR l.submitted,
      submitted_at         = COALESCE(w.submitted_at, l.submitted_at),
      curriculum_version   = COALESCE(w.curriculum_version, l.curriculum_version),
      course               = COALESCE(w.course, l.course),
      curriculum_unit_key  = COALESCE(w.curriculum_unit_key, l.curriculum_unit_key),
      updated_at           = GREATEST(w.updated_at, l.updated_at)
    FROM public.lesson_records l
    WHERE w.id = winner_id AND l.id = ANY(loser_ids);

    -- losers 삭제
    DELETE FROM public.lesson_records WHERE id = ANY(loser_ids);
  END LOOP;
END $$;

-- 최종 유니크 인덱스
CREATE UNIQUE INDEX IF NOT EXISTS lesson_records_unique_per_day
  ON public.lesson_records (student_id, subject, lesson_date);
