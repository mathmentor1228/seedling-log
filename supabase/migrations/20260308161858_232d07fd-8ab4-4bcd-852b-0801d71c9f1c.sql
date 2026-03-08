
-- 1. Textbook orders (교재 신청)
CREATE TABLE public.textbook_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  textbook_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT '신청',
  requested_by UUID NOT NULL,
  requested_by_name TEXT NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by_name TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Textbook distributions (교재 배부)
CREATE TABLE public.textbook_distributions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.textbook_orders(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  student_name TEXT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  total_amount INT NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT '미납',
  paid_at TIMESTAMPTZ,
  confirmed_by TEXT,
  distributed_by UUID NOT NULL,
  distributed_by_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.textbook_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.textbook_distributions ENABLE ROW LEVEL SECURITY;

-- RLS for textbook_orders: authenticated users can read, teachers/admin can insert, admin can update
CREATE POLICY "Authenticated users can read textbook_orders"
  ON public.textbook_orders FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers and admin can insert textbook_orders"
  ON public.textbook_orders FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')
  );

CREATE POLICY "Admin can update textbook_orders"
  ON public.textbook_orders FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR requested_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR requested_by = auth.uid());

CREATE POLICY "Admin can delete textbook_orders"
  ON public.textbook_orders FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS for textbook_distributions
CREATE POLICY "Authenticated users can read textbook_distributions"
  ON public.textbook_distributions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Teachers and admin can insert textbook_distributions"
  ON public.textbook_distributions FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'teacher')
  );

CREATE POLICY "Admin can update textbook_distributions"
  ON public.textbook_distributions FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.is_admin_staff())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.is_admin_staff());

CREATE POLICY "Admin can delete textbook_distributions"
  ON public.textbook_distributions FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.textbook_orders;
