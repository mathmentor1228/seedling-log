-- Add assistant UPDATE policy for lesson_records (within 7 days)
CREATE POLICY "Assistants can update lesson_records within 7 days" 
ON public.lesson_records 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'assistant'::app_role) 
  AND lesson_date >= (CURRENT_DATE - INTERVAL '7 days')
);

-- Add assistant UPDATE policy for homework_assignments (within 7 days for content, already has check policy)
-- The existing policy "Assistants can update homework check within 7 days" should already allow updates
-- But we need to ensure assistants can also update content, not just check fields
DROP POLICY IF EXISTS "Assistants can update homework check within 7 days" ON public.homework_assignments;

CREATE POLICY "Assistants can update homework within 7 days" 
ON public.homework_assignments 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'assistant'::app_role) 
  AND assigned_date >= (CURRENT_DATE - INTERVAL '7 days')
);

-- Add assistant INSERT policy for homework_assignments (within 7 days)
CREATE POLICY "Assistants can insert homework within 7 days" 
ON public.homework_assignments 
FOR INSERT 
WITH CHECK (
  has_role(auth.uid(), 'assistant'::app_role) 
  AND assigned_date >= (CURRENT_DATE - INTERVAL '7 days')
);