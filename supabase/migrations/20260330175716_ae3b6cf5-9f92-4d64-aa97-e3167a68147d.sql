
CREATE TABLE IF NOT EXISTS public.congestion_predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prediction_date date NOT NULL,
  day_of_week int NOT NULL,
  hour int NOT NULL,
  predicted_count int NOT NULL DEFAULT 0,
  classroom_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (prediction_date, hour, classroom_id)
);

ALTER TABLE public.congestion_predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read on congestion_predictions"
  ON public.congestion_predictions FOR SELECT
  USING (true);

CREATE POLICY "Allow service insert on congestion_predictions"
  ON public.congestion_predictions FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow service update on congestion_predictions"
  ON public.congestion_predictions FOR UPDATE
  USING (true);
