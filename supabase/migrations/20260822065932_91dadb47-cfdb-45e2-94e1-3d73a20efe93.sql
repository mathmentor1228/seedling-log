CREATE OR REPLACE FUNCTION public.dq_base36(n bigint)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE digits text := '0123456789abcdefghijklmnopqrstuvwxyz'; v bigint := n; out text := '';
BEGIN
  IF v = 0 THEN RETURN '0'; END IF;
  WHILE v > 0 LOOP
    out := substr(digits, (v % 36)::int + 1, 1) || out;
    v := v / 36;
  END LOOP;
  RETURN out;
END $$;

CREATE OR REPLACE FUNCTION public.dq_sign(k text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE h bigint := 5381; h2 bigint := 52711; i int; c bigint; n int := length(k);
BEGIN
  FOR i IN 1..n LOOP
    c := ascii(substr(k, i, 1));
    h := ((h * 33) + c) % 4294967296;
  END LOOP;
  FOR i IN REVERSE n..1 LOOP
    c := ascii(substr(k, i, 1));
    h2 := ((h2 * 33) + c) % 4294967296;
  END LOOP;
  RETURN public.dq_base36(h) || public.dq_base36(h2);
END $$;

REVOKE EXECUTE ON FUNCTION public.dq_sign(text) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.dq_base36(bigint) FROM anon, authenticated;