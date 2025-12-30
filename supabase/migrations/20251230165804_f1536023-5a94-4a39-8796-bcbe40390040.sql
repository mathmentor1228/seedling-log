-- Add columns for separate student/parent messages and send statuses
ALTER TABLE public.weekly_reports
ADD COLUMN IF NOT EXISTS student_message text,
ADD COLUMN IF NOT EXISTS parent_message text,
ADD COLUMN IF NOT EXISTS student_sent_status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS parent_sent_status text DEFAULT 'draft',
ADD COLUMN IF NOT EXISTS student_sent_at timestamptz,
ADD COLUMN IF NOT EXISTS parent_sent_at timestamptz;