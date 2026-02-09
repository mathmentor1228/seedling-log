
-- Add assigned_teacher column to vocab_settings for teacher categorization
ALTER TABLE public.vocab_settings ADD COLUMN assigned_teacher text DEFAULT NULL;
COMMENT ON COLUMN public.vocab_settings.assigned_teacher IS 'Teacher category: seo (서미정) or kim (김민희)';
