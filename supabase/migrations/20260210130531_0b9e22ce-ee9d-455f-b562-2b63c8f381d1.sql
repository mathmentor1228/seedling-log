-- Add audio_url column to homework_assignments for voice recordings
ALTER TABLE public.homework_assignments
ADD COLUMN submission_audio_url text;
