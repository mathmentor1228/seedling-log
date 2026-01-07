-- ASSISTANT-TASKTYPE-CHECK-FIX-V1
-- Update task_type CHECK constraint to include Korean values

ALTER TABLE public.assistant_tasks
DROP CONSTRAINT assistant_tasks_task_type_check;

ALTER TABLE public.assistant_tasks
ADD CONSTRAINT assistant_tasks_task_type_check 
CHECK (task_type = ANY (ARRAY[
  -- Original English values
  'homework_verify'::text, 
  'test_entry'::text, 
  'attendance_check'::text, 
  'teacher_remind'::text, 
  'makeup_check'::text, 
  'etc'::text, 
  'teacher_request'::text,
  -- Korean values (used by UI)
  '기타'::text,
  '숙제확인'::text,
  '테스트입력'::text,
  '출결확인'::text,
  '보강확인'::text,
  '선생님요청'::text
]));