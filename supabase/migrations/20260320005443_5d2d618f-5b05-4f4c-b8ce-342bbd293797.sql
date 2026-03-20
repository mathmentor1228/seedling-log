CREATE OR REPLACE FUNCTION public.upsert_teacher_student_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only create or refresh link when record is submitted and both ids exist
  IF NEW.submitted = true
     AND NEW.teacher_id IS NOT NULL
     AND NEW.student_id IS NOT NULL THEN

    UPDATE public.teacher_student_links
    SET last_seen_at = now()
    WHERE teacher_id = NEW.teacher_id
      AND student_id = NEW.student_id;

    IF NOT FOUND THEN
      BEGIN
        INSERT INTO public.teacher_student_links (
          teacher_id,
          student_id,
          first_seen_at,
          last_seen_at
        ) VALUES (
          NEW.teacher_id,
          NEW.student_id,
          now(),
          now()
        );
      EXCEPTION
        WHEN unique_violation THEN
          UPDATE public.teacher_student_links
          SET last_seen_at = now()
          WHERE teacher_id = NEW.teacher_id
            AND student_id = NEW.student_id;
      END;
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;