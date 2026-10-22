CREATE OR REPLACE FUNCTION public.assign_tuition_receipt_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  receipt_year integer;
  next_number integer;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD.receipt_number IS NOT NULL AND NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN
      RAISE EXCEPTION 'An assigned receipt number cannot be changed';
    END IF;
    RETURN NEW;
  END IF;
  receipt_year := EXTRACT(YEAR FROM NEW.paid_date)::integer;
  PERFORM pg_advisory_xact_lock(4736, receipt_year);
  SELECT COALESCE(MAX(split_part(receipt_number, '-', 2)::integer), 0) + 1
    INTO next_number
    FROM public.payment_records
    WHERE receipt_number ~ ('^' || receipt_year::text || '-[0-9]+$');
  NEW.receipt_number := receipt_year::text || '-' || lpad(next_number::text, GREATEST(4, length(next_number::text)), '0');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_tuition_receipt_number() FROM PUBLIC;
CREATE TRIGGER tuition_receipt_number_insert
BEFORE INSERT ON public.payment_records
FOR EACH ROW EXECUTE FUNCTION public.assign_tuition_receipt_number();
CREATE TRIGGER tuition_receipt_number_immutable
BEFORE UPDATE OF receipt_number ON public.payment_records
FOR EACH ROW EXECUTE FUNCTION public.assign_tuition_receipt_number();
CREATE UNIQUE INDEX IF NOT EXISTS payment_records_receipt_number_unique
ON public.payment_records(receipt_number) WHERE receipt_number IS NOT NULL;