-- Enable realtime for homework tables to sync homework check status across views
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'homework_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.homework_assignments;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'homework_submissions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.homework_submissions;
  END IF;
END $$;

-- Ensure REPLICA IDENTITY FULL so updates broadcast all columns
ALTER TABLE public.homework_assignments REPLICA IDENTITY FULL;
ALTER TABLE public.homework_submissions REPLICA IDENTITY FULL;
ALTER TABLE public.lesson_records REPLICA IDENTITY FULL;