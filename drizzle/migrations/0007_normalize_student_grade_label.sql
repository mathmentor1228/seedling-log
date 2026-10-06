CREATE OR REPLACE FUNCTION public.normalize_student_grade()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.school_level IN ('초','중','고') AND NEW.grade_year IS NOT NULL THEN
    NEW.grade := NEW.school_level || NEW.grade_year::text;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_normalize_student_grade ON public.students;
CREATE TRIGGER trg_normalize_student_grade BEFORE INSERT OR UPDATE OF grade, school_level, grade_year ON public.students
FOR EACH ROW EXECUTE FUNCTION public.normalize_student_grade();