DROP POLICY IF EXISTS "Authenticated staff can manage exam analysis reports" ON public.exam_analysis_reports;
DROP POLICY IF EXISTS "Authenticated staff can manage exam analysis items" ON public.exam_analysis_items;
DROP POLICY IF EXISTS "Authenticated staff can view exam analysis files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated staff can upload exam analysis files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated staff can update exam analysis files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated staff can delete exam analysis files" ON storage.objects;

CREATE POLICY "Staff can view exam analysis reports"
ON public.exam_analysis_reports
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff can create exam analysis reports"
ON public.exam_analysis_reports
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff can update exam analysis reports"
ON public.exam_analysis_reports
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff can delete exam analysis reports"
ON public.exam_analysis_reports
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'teacher')
  OR public.has_role(auth.uid(), 'assistant')
);

CREATE POLICY "Staff can view exam analysis items"
ON public.exam_analysis_items
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_analysis_reports reports
    WHERE reports.id = exam_analysis_items.report_id
  )
);

CREATE POLICY "Staff can create exam analysis items"
ON public.exam_analysis_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.exam_analysis_reports reports
    WHERE reports.id = exam_analysis_items.report_id
  )
);

CREATE POLICY "Staff can update exam analysis items"
ON public.exam_analysis_items
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_analysis_reports reports
    WHERE reports.id = exam_analysis_items.report_id
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.exam_analysis_reports reports
    WHERE reports.id = exam_analysis_items.report_id
  )
);

CREATE POLICY "Staff can delete exam analysis items"
ON public.exam_analysis_items
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.exam_analysis_reports reports
    WHERE reports.id = exam_analysis_items.report_id
  )
);

CREATE POLICY "Staff can view exam analysis files"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'exam-analysis'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
);

CREATE POLICY "Staff can upload exam analysis files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'exam-analysis'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
);

CREATE POLICY "Staff can update exam analysis files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'exam-analysis'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
)
WITH CHECK (
  bucket_id = 'exam-analysis'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
);

CREATE POLICY "Staff can delete exam analysis files"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'exam-analysis'
  AND (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'teacher')
    OR public.has_role(auth.uid(), 'assistant')
  )
);