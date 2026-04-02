
-- 1. billing_schedules: 월별 청구 일정
CREATE TABLE public.billing_schedules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_course_id UUID REFERENCES public.student_courses(id) ON DELETE SET NULL,
  billing_month TEXT NOT NULL, -- 'YYYY-MM' format
  base_amount NUMERIC(10,0) NOT NULL DEFAULT 0,
  discount_amount NUMERIC(10,0) NOT NULL DEFAULT 0,
  final_amount NUMERIC(10,0) NOT NULL DEFAULT 0,
  due_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending, paid, overdue, cancelled
  late_fee NUMERIC(10,0) NOT NULL DEFAULT 0,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. payment_records: 실제 납부 기록
CREATE TABLE public.payment_records (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  billing_schedule_id UUID REFERENCES public.billing_schedules(id) ON DELETE SET NULL,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  amount NUMERIC(10,0) NOT NULL,
  paid_date DATE NOT NULL,
  payment_method TEXT NOT NULL DEFAULT '계좌이체', -- 현금, 카드, 계좌이체
  receipt_number TEXT,
  memo TEXT,
  recorded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.billing_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_records ENABLE ROW LEVEL SECURITY;

-- RLS policies for billing_schedules
CREATE POLICY "Authenticated users can view billing_schedules"
  ON public.billing_schedules FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin can manage billing_schedules"
  ON public.billing_schedules FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers and assistants can insert billing_schedules"
  ON public.billing_schedules FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- RLS policies for payment_records
CREATE POLICY "Authenticated users can view payment_records"
  ON public.payment_records FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin can manage payment_records"
  ON public.payment_records FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Teachers and assistants can insert payment_records"
  ON public.payment_records FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'teacher') OR
    public.has_role(auth.uid(), 'assistant')
  );

-- Indexes
CREATE INDEX idx_billing_schedules_student ON public.billing_schedules(student_id);
CREATE INDEX idx_billing_schedules_month ON public.billing_schedules(billing_month);
CREATE INDEX idx_billing_schedules_status ON public.billing_schedules(status);
CREATE INDEX idx_payment_records_student ON public.payment_records(student_id);
CREATE INDEX idx_payment_records_billing ON public.payment_records(billing_schedule_id);

-- Updated_at trigger for billing_schedules
CREATE TRIGGER update_billing_schedules_updated_at
  BEFORE UPDATE ON public.billing_schedules
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
