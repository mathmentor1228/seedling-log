ALTER TABLE public.textbook_orders
  ADD COLUMN IF NOT EXISTS is_inhouse boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inhouse_author text;

CREATE INDEX IF NOT EXISTS idx_textbook_orders_is_inhouse ON public.textbook_orders (is_inhouse);