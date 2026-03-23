
-- 1. Create classrooms table
CREATE TABLE public.classrooms (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  manager_name TEXT NOT NULL DEFAULT '',
  capacity INT NOT NULL DEFAULT 10,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.classrooms ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view classrooms"
  ON public.classrooms FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage classrooms"
  ON public.classrooms FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- 2. Add classroom_id to class_schedules
ALTER TABLE public.class_schedules ADD COLUMN classroom_id UUID REFERENCES public.classrooms(id) ON DELETE SET NULL;

-- 3. Seed classroom data
INSERT INTO public.classrooms (name, manager_name, capacity, sort_order) VALUES
  ('2강', '최윤기', 8, 1),
  ('4강', '조준희', 7, 2),
  ('5강', '서미정', 12, 3),
  ('6강', '이나연', 8, 4),
  ('7강', '정선호', 7, 5),
  ('8강', '김민희', 8, 6),
  ('9강', '황은지', 12, 7),
  ('10강', '테스트실', 22, 8),
  ('유리문', '자습실', 14, 9);
