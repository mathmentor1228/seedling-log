DROP POLICY "Admin can update textbook_distributions" ON public.textbook_distributions;

CREATE POLICY "Admin and teacher can update textbook_distributions"
ON public.textbook_distributions
FOR UPDATE
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR is_admin_staff() 
  OR has_role(auth.uid(), 'teacher'::app_role)
)
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role) 
  OR is_admin_staff() 
  OR has_role(auth.uid(), 'teacher'::app_role)
);