CREATE TABLE public.signup_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  share_token text NOT NULL UNIQUE DEFAULT public.generate_share_token(),
  is_open boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.signup_slots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES public.signup_events(id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  start_time time NOT NULL,
  end_time time,
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.signup_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id uuid NOT NULL REFERENCES public.signup_slots(id) ON DELETE CASCADE,
  student_name text NOT NULL,
  grade text,
  phone text,
  memo text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_signup_slots_event ON public.signup_slots(event_id);
CREATE INDEX idx_signup_entries_slot ON public.signup_entries(slot_id);
CREATE UNIQUE INDEX uq_signup_entry_person ON public.signup_entries(slot_id, lower(student_name), coalesce(phone, ''));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_slots TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.signup_entries TO authenticated;
GRANT ALL ON public.signup_events TO service_role;
GRANT ALL ON public.signup_slots TO service_role;
GRANT ALL ON public.signup_entries TO service_role;

ALTER TABLE public.signup_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signup_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff manage signup events" ON public.signup_events
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid())
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR created_by = auth.uid());

CREATE POLICY "staff manage signup slots" ON public.signup_slots
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.signup_events e WHERE e.id = event_id AND (public.has_role(auth.uid(), 'admin') OR e.created_by = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.signup_events e WHERE e.id = event_id AND (public.has_role(auth.uid(), 'admin') OR e.created_by = auth.uid())));

CREATE POLICY "staff manage signup entries" ON public.signup_entries
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.signup_slots s JOIN public.signup_events e ON e.id = s.event_id
    WHERE s.id = slot_id AND (public.has_role(auth.uid(), 'admin') OR e.created_by = auth.uid())))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.signup_slots s JOIN public.signup_events e ON e.id = s.event_id
    WHERE s.id = slot_id AND (public.has_role(auth.uid(), 'admin') OR e.created_by = auth.uid())));

CREATE TRIGGER trg_signup_events_updated_at BEFORE UPDATE ON public.signup_events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_signup_slots_updated_at BEFORE UPDATE ON public.signup_slots
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();