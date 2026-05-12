
DO $$
DECLARE
  _new_id uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous
  ) VALUES (
    _new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'seomijung.archived@local.invalid', crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"full_name":"서미정","archived":true}'::jsonb,
    false, false, false
  );

  -- Profile auto-created by trigger; update it to ensure correct fields
  UPDATE public.profiles
  SET full_name = '서미정', is_active = false, assigned_subject = '영어', updated_at = now()
  WHERE id = _new_id;

  -- If trigger didn't create a profile, insert one
  INSERT INTO public.profiles (id, email, full_name, is_active, assigned_subject)
  SELECT _new_id, 'seomijung.archived@local.invalid', '서미정', false, '영어'
  WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = _new_id);

  -- Reassign historical lesson_records (≤ 2026-04-30) to archived 서미정
  UPDATE public.lesson_records
  SET teacher_id = _new_id
  WHERE teacher_id = '73a3d463-40e5-452e-877a-74b2044981e4'
    AND lesson_date <= '2026-04-30';

  -- Rename active account 서미정 → 김다빈
  UPDATE public.profiles
  SET full_name = '김다빈', updated_at = now()
  WHERE id = '73a3d463-40e5-452e-877a-74b2044981e4';
END $$;
