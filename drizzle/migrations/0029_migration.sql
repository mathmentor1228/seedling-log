CREATE INDEX IF NOT EXISTS idx_lesson_records_lesson_date ON public.lesson_records (lesson_date);
CREATE INDEX IF NOT EXISTS idx_lesson_records_class_date ON public.lesson_records (class_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_lesson_records_teacher_date ON public.lesson_records (teacher_id, lesson_date);
CREATE INDEX IF NOT EXISTS idx_homework_assignments_assigned_date ON public.homework_assignments (assigned_date);
CREATE INDEX IF NOT EXISTS idx_homework_assignments_lesson_record ON public.homework_assignments (lesson_record_id);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_date_student ON public.attendance_logs (date, student_id);
CREATE INDEX IF NOT EXISTS idx_class_students_class ON public.class_students (class_id);
CREATE INDEX IF NOT EXISTS idx_class_students_student ON public.class_students (student_id);
ANALYZE public.lesson_records; ANALYZE public.homework_assignments; ANALYZE public.attendance_logs; ANALYZE public.class_students;