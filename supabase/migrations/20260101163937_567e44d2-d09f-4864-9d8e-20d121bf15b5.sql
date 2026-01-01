-- Team Notes table for 코멘트/요청 보드
CREATE TABLE public.team_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_role text NULL CHECK (target_role IN ('admin', 'teacher', 'assistant')),
  target_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  teacher_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  scope text NOT NULL DEFAULT 'general' CHECK (scope IN ('general', 'student', 'class', 'ops')),
  student_id uuid NULL REFERENCES public.students(id) ON DELETE SET NULL,
  class_id uuid NULL REFERENCES public.classes(id) ON DELETE SET NULL,
  due_date date NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done')),
  title text NOT NULL,
  body text NULL,
  done_at timestamptz NULL,
  done_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Team Note Replies for threading
CREATE TABLE public.team_note_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.team_notes(id) ON DELETE CASCADE,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Team Note Attachments
CREATE TABLE public.team_note_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id uuid NOT NULL REFERENCES public.team_notes(id) ON DELETE CASCADE,
  storage_path text NOT NULL,
  original_name text NOT NULL,
  mime_type text NULL,
  file_size integer NULL,
  uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Academy Events for calendar/announcements
CREATE TABLE public.academy_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NULL,
  start_at timestamptz NOT NULL,
  end_at timestamptz NULL,
  all_day boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'all' CHECK (visibility IN ('all', 'admin', 'teacher', 'assistant', 'teacher_specific')),
  teacher_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  location text NULL,
  category text NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'notice', 'exam', 'meeting', 'holiday', 'event')),
  is_announcement boolean NOT NULL DEFAULT false,
  pinned boolean NOT NULL DEFAULT false
);

-- Enable RLS on all new tables
ALTER TABLE public.team_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_note_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_note_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academy_events ENABLE ROW LEVEL SECURITY;

-- RLS for team_notes
CREATE POLICY "Admins can do all on team_notes"
ON public.team_notes FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view relevant team_notes"
ON public.team_notes FOR SELECT
USING (
  has_role(auth.uid(), 'admin') OR
  created_by = auth.uid() OR
  target_user_id = auth.uid() OR
  (target_role IS NOT NULL AND (
    (target_role = 'teacher' AND has_role(auth.uid(), 'teacher')) OR
    (target_role = 'assistant' AND has_role(auth.uid(), 'assistant'))
  )) OR
  (target_role IS NULL AND target_user_id IS NULL)
);

CREATE POLICY "Users can insert team_notes"
ON public.team_notes FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  has_role(auth.uid(), 'teacher') OR
  has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Users can update their notes or mark done"
ON public.team_notes FOR UPDATE
USING (
  has_role(auth.uid(), 'admin') OR
  created_by = auth.uid() OR
  target_user_id = auth.uid()
);

CREATE POLICY "Users can delete their own notes"
ON public.team_notes FOR DELETE
USING (
  has_role(auth.uid(), 'admin') OR
  created_by = auth.uid()
);

-- RLS for team_note_replies
CREATE POLICY "Admins can do all on team_note_replies"
ON public.team_note_replies FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view replies on visible notes"
ON public.team_note_replies FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_notes tn
    WHERE tn.id = note_id
  )
);

CREATE POLICY "Users can insert replies on visible notes"
ON public.team_note_replies FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.team_notes tn
    WHERE tn.id = note_id
  )
);

CREATE POLICY "Users can delete own replies"
ON public.team_note_replies FOR DELETE
USING (
  has_role(auth.uid(), 'admin') OR
  created_by = auth.uid()
);

-- RLS for team_note_attachments
CREATE POLICY "Admins can do all on team_note_attachments"
ON public.team_note_attachments FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view attachments on visible notes"
ON public.team_note_attachments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.team_notes tn
    WHERE tn.id = note_id
  )
);

CREATE POLICY "Users can insert attachments on visible notes"
ON public.team_note_attachments FOR INSERT
WITH CHECK (
  uploaded_by = auth.uid() AND
  EXISTS (
    SELECT 1 FROM public.team_notes tn
    WHERE tn.id = note_id
  )
);

CREATE POLICY "Users can delete own attachments"
ON public.team_note_attachments FOR DELETE
USING (
  has_role(auth.uid(), 'admin') OR
  uploaded_by = auth.uid()
);

-- RLS for academy_events
CREATE POLICY "Admins can do all on academy_events"
ON public.academy_events FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view relevant events"
ON public.academy_events FOR SELECT
USING (
  visibility = 'all' OR
  has_role(auth.uid(), 'admin') OR
  (visibility = 'teacher' AND has_role(auth.uid(), 'teacher')) OR
  (visibility = 'assistant' AND has_role(auth.uid(), 'assistant')) OR
  (visibility = 'teacher_specific' AND teacher_id = auth.uid())
);

CREATE POLICY "Teachers can insert teacher events"
ON public.academy_events FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin') OR
  (has_role(auth.uid(), 'teacher') AND visibility IN ('all', 'teacher')) OR
  (has_role(auth.uid(), 'assistant') AND visibility IN ('all', 'assistant'))
);

CREATE POLICY "Users can update own events"
ON public.academy_events FOR UPDATE
USING (
  has_role(auth.uid(), 'admin') OR
  created_by = auth.uid()
);

CREATE POLICY "Users can delete own events"
ON public.academy_events FOR DELETE
USING (
  has_role(auth.uid(), 'admin') OR
  created_by = auth.uid()
);

-- Create storage bucket for team_files (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('team_files', 'team_files', false);

-- Storage policies for team_files bucket
CREATE POLICY "Users can upload to team_files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'team_files' AND
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher') OR has_role(auth.uid(), 'assistant'))
);

CREATE POLICY "Users can view team_files they have access to"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'team_files' AND
  (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'teacher') OR has_role(auth.uid(), 'assistant'))
);

CREATE POLICY "Users can delete own files or admin"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'team_files' AND
  (has_role(auth.uid(), 'admin') OR auth.uid()::text = (storage.foldername(name))[2])
);

-- Indexes for performance
CREATE INDEX idx_team_notes_created_by ON public.team_notes(created_by);
CREATE INDEX idx_team_notes_target_user ON public.team_notes(target_user_id);
CREATE INDEX idx_team_notes_status ON public.team_notes(status);
CREATE INDEX idx_team_notes_created_at ON public.team_notes(created_at DESC);
CREATE INDEX idx_team_note_replies_note_id ON public.team_note_replies(note_id);
CREATE INDEX idx_team_note_attachments_note_id ON public.team_note_attachments(note_id);
CREATE INDEX idx_academy_events_start_at ON public.academy_events(start_at);
CREATE INDEX idx_academy_events_visibility ON public.academy_events(visibility);
CREATE INDEX idx_academy_events_category ON public.academy_events(category);