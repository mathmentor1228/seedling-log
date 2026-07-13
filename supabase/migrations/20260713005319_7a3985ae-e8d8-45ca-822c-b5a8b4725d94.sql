WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      ORDER BY
        COALESCE((regexp_match(title, '(?i)(?:day|chapter|unit|week|데이)\s*0*([0-9]+)'))[1]::int, -1) ASC,
        created_at ASC,
        id ASC
    ) AS rn
  FROM public.vocab_word_sets
  WHERE regexp_match(title, '(?i)(?:day|chapter|unit|week|데이)\s*0*([0-9]+)') IS NOT NULL
), bounds AS (
  SELECT COALESCE(MAX(round_number), 0) AS max_round
  FROM public.vocab_word_sets
  WHERE regexp_match(title, '(?i)(?:day|chapter|unit|week|데이)\s*0*([0-9]+)') IS NULL
)
UPDATE public.vocab_word_sets v
SET round_number = bounds.max_round + ranked.rn
FROM ranked, bounds
WHERE v.id = ranked.id;