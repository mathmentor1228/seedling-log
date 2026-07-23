WITH resolved AS (
  SELECT DISTINCT ON (lr.id) lr.id AS lr_id, cs.class_id
  FROM lesson_records lr
  JOIN class_students cs ON cs.student_id = lr.student_id
  JOIN class_schedules sch
    ON sch.class_id = cs.class_id
   AND sch.day_of_week = EXTRACT(DOW FROM lr.lesson_date)::int
   AND sch.is_active = true
  JOIN classes c ON c.id = cs.class_id
  WHERE lr.class_id IS NULL
    AND lr.lesson_date >= CURRENT_DATE - INTERVAL '30 days'
    AND sch.teacher_id = lr.teacher_id
    AND (c.subject IS NULL OR c.subject = lr.subject)
)
UPDATE lesson_records lr
   SET class_id = r.class_id
  FROM resolved r
 WHERE lr.id = r.lr_id;