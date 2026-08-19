
-- exam_analysis_items
DROP POLICY IF EXISTS "Staff can view exam analysis items" ON public.exam_analysis_items;
DROP POLICY IF EXISTS "Staff can create exam analysis items" ON public.exam_analysis_items;
DROP POLICY IF EXISTS "Staff can update exam analysis items" ON public.exam_analysis_items;
DROP POLICY IF EXISTS "Staff can delete exam analysis items" ON public.exam_analysis_items;

REVOKE ALL ON public.exam_analysis_items FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_analysis_items TO authenticated;
GRANT ALL ON public.exam_analysis_items TO service_role;
ALTER TABLE public.exam_analysis_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can view exam analysis items"
ON public.exam_analysis_items FOR SELECT TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR has_role(auth.uid(),'teacher'::app_role)
  OR has_role(auth.uid(),'assistant'::app_role)
);

CREATE POLICY "Admins and owning teachers can insert exam analysis items"
ON public.exam_analysis_items FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.exam_analysis_reports r
    WHERE r.id = exam_analysis_items.report_id AND r.created_by = auth.uid()
  ))
);

CREATE POLICY "Admins and owning teachers can update exam analysis items"
ON public.exam_analysis_items FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.exam_analysis_reports r
    WHERE r.id = exam_analysis_items.report_id AND r.created_by = auth.uid()
  ))
)
WITH CHECK (
  has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.exam_analysis_reports r
    WHERE r.id = exam_analysis_items.report_id AND r.created_by = auth.uid()
  ))
);

CREATE POLICY "Admins and owning teachers can delete exam analysis items"
ON public.exam_analysis_items FOR DELETE TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role)
  OR (has_role(auth.uid(),'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.exam_analysis_reports r
    WHERE r.id = exam_analysis_items.report_id AND r.created_by = auth.uid()
  ))
);

-- exam_reviews
DROP POLICY IF EXISTS "authenticated read" ON public.exam_reviews;
DROP POLICY IF EXISTS "authenticated write" ON public.exam_reviews;
REVOKE ALL ON public.exam_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_reviews TO authenticated;
GRANT ALL ON public.exam_reviews TO service_role;
ALTER TABLE public.exam_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage exam reviews"
ON public.exam_reviews FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Teachers manage own or owned-student exam reviews"
ON public.exam_reviews FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'teacher'::app_role) AND (
    reviewed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.student_exam_results r
      WHERE r.id = exam_reviews.result_id
        AND public.teacher_owns_student(auth.uid(), r.student_id)
    )
  )
)
WITH CHECK (
  has_role(auth.uid(),'teacher'::app_role) AND (
    reviewed_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.student_exam_results r
      WHERE r.id = exam_reviews.result_id
        AND public.teacher_owns_student(auth.uid(), r.student_id)
    )
  )
);

-- exam_item_reviews
DROP POLICY IF EXISTS "authenticated read items" ON public.exam_item_reviews;
DROP POLICY IF EXISTS "authenticated write items" ON public.exam_item_reviews;
REVOKE ALL ON public.exam_item_reviews FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exam_item_reviews TO authenticated;
GRANT ALL ON public.exam_item_reviews TO service_role;
ALTER TABLE public.exam_item_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage exam item reviews"
ON public.exam_item_reviews FOR ALL TO authenticated
USING (has_role(auth.uid(),'admin'::app_role))
WITH CHECK (has_role(auth.uid(),'admin'::app_role));

CREATE POLICY "Teachers manage own or owned-student exam item reviews"
ON public.exam_item_reviews FOR ALL TO authenticated
USING (
  has_role(auth.uid(),'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.exam_reviews er
    LEFT JOIN public.student_exam_results r ON r.id = er.result_id
    WHERE er.id = exam_item_reviews.review_id
      AND (er.reviewed_by = auth.uid() OR public.teacher_owns_student(auth.uid(), r.student_id))
  )
)
WITH CHECK (
  has_role(auth.uid(),'teacher'::app_role) AND EXISTS (
    SELECT 1 FROM public.exam_reviews er
    LEFT JOIN public.student_exam_results r ON r.id = er.result_id
    WHERE er.id = exam_item_reviews.review_id
      AND (er.reviewed_by = auth.uid() OR public.teacher_owns_student(auth.uid(), r.student_id))
  )
);
