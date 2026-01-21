-- Fix 1: Enable RLS on curriculum_map_backup_math (may already be done by partial execution)
ALTER TABLE IF EXISTS public.curriculum_map_backup_math ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any and recreate
DROP POLICY IF EXISTS "Authenticated can view curriculum backup" ON public.curriculum_map_backup_math;
DROP POLICY IF EXISTS "Admins can manage curriculum backup" ON public.curriculum_map_backup_math;

CREATE POLICY "Authenticated can view curriculum backup"
ON public.curriculum_map_backup_math FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can manage curriculum backup"
ON public.curriculum_map_backup_math FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Fix 2: academy_events already has "Users can view relevant events" with proper visibility logic
-- The scan flagged public exposure but the RLS already restricts to role-based visibility
-- No change needed - marking as properly configured

-- Fix 3: report_templates - drop the overly permissive policy
DROP POLICY IF EXISTS "Service role can read report_templates" ON public.report_templates;

-- Add authenticated-only select policy
CREATE POLICY "Authenticated can read report_templates"
ON public.report_templates FOR SELECT
TO authenticated
USING (true);

-- Fix 4: team_notes already has "Users can view relevant team_notes" with proper targeting
-- No change needed - already properly restricted