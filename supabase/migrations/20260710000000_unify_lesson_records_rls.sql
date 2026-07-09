-- UNIFY-LESSON-KEY-V1: 수업일지 통일 — 키 = (학생, 과목, 날짜)
-- 여러 입력 경로(수업계획/수업일지 폼/테스트 입력)가 같은 날 일지를 하나로 병합하려면
-- 담당 학생의 일지를 "만든 사람이 달라도" 교사가 조회·수정할 수 있어야 한다.
CREATE POLICY "Teachers can view records of their class students"
ON public.lesson_records FOR SELECT
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = lesson_records.student_id
      AND c.teacher_id = auth.uid()
  )
);

CREATE POLICY "Teachers can update records of their class students"
ON public.lesson_records FOR UPDATE
USING (
  has_role(auth.uid(), 'teacher'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.class_students cs
    JOIN public.classes c ON c.id = cs.class_id
    WHERE cs.student_id = lesson_records.student_id
      AND c.teacher_id = auth.uid()
  )
);
