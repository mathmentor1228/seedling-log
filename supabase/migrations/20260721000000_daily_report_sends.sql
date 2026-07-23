-- 데일리 학습 안내 발송 로그 — 같은 날짜 중복 발송 방지 + 발송 이력 조회
CREATE TABLE IF NOT EXISTS public.daily_report_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  report_date date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  variables jsonb,
  UNIQUE (student_id, report_date)
);

ALTER TABLE public.daily_report_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "daily_report_sends_admin_read" ON public.daily_report_sends
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'teacher')
    )
  );
