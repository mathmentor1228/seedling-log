ALTER TABLE public.textbook_orders 
  ADD COLUMN grade text DEFAULT null,
  ADD COLUMN category text DEFAULT '기타';
