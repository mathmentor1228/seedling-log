
-- Add trial expiry support to user_roles
ALTER TABLE public.user_roles 
ADD COLUMN trial_expires_at timestamptz DEFAULT NULL;

-- Add index for efficient trial expiry checks
CREATE INDEX idx_user_roles_trial_expires ON public.user_roles (trial_expires_at) 
WHERE trial_expires_at IS NOT NULL;

-- Create a function to auto-assign teacher role with trial expiry on signup
-- This will be called from a trigger on auth.users
CREATE OR REPLACE FUNCTION public.handle_trial_signup()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Check if the new user's email metadata indicates trial
  -- We use raw_user_meta_data to pass trial flag during signup
  IF (NEW.raw_user_meta_data->>'is_trial')::boolean = true THEN
    INSERT INTO public.user_roles (user_id, role, trial_expires_at)
    VALUES (NEW.id, 'teacher', now() + interval '7 days');
    
    -- Also create a profile
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
      NEW.id, 
      NEW.email, 
      COALESCE(NEW.raw_user_meta_data->>'full_name', '체험 사용자')
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger on auth.users for trial signups
CREATE TRIGGER on_trial_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_trial_signup();
