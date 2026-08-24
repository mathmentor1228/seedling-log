INSERT INTO public.classrooms (name, manager_name, capacity, is_active, sort_order)
SELECT '3강', '김은수', 12, true, 2
WHERE NOT EXISTS (SELECT 1 FROM public.classrooms WHERE name = '3강');

UPDATE public.classrooms SET sort_order = sort_order + 1 WHERE name IN ('4강','5강','6강','7강','8강','9강','10강','유리문');