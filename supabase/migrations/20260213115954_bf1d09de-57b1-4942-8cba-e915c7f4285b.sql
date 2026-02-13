
-- Fix: handle_trial_signup trigger was also inserting into profiles,
-- conflicting with handle_new_user trigger. Remove the duplicate insert.
CREATE OR REPLACE FUNCTION public.handle_trial_signup()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF (NEW.raw_user_meta_data->>'is_trial')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role, trial_expires_at)
    VALUES (NEW.id, 'teacher', now() + interval '7 days');
  END IF;
  RETURN NEW;
END;
$function$;
