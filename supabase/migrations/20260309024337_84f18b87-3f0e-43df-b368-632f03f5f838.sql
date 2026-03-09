ALTER TABLE public.textbook_orders 
  ADD COLUMN IF NOT EXISTS distributed_qty integer NOT NULL DEFAULT 0;