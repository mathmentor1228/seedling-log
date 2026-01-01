-- Drop the unique constraint that prevents overlapping slots during creation
-- Overlaps should only be checked during student assignment, not slot creation
ALTER TABLE public.class_schedules DROP CONSTRAINT IF EXISTS unique_teacher_slot;