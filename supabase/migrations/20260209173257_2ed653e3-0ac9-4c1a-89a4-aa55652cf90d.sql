
-- Add absence_reason column to vocab_schedules for students who miss tests
ALTER TABLE public.vocab_schedules ADD COLUMN absence_reason text;
-- Valid values: '인정결석', '무단결석', '기타결석', or NULL (not absent)
