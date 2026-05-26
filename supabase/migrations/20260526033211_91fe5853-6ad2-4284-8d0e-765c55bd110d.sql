-- Create missing auth user for Margen Pizzaria and link to company
DO $$
DECLARE
  v_company_id uuid := 'a0071b86-6f2a-43f5-80d9-26e3ecd4b70c';
  v_email text := 'margenpizzaria@gmail.com';
  v_password text := '123456';
  v_user_id uuid;
BEGIN
  -- Check if user already exists
  SELECT id INTO v_user_id FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_user_id IS NULL THEN
    v_user_id := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_user_id,
      'authenticated',
      'authenticated',
      v_email,
      crypt(v_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name','Margen Pizzaria'),
      now(), now(), '', '', '', ''
    );

    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), v_user_id,
      jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true),
      'email', v_user_id::text, now(), now(), now());

    INSERT INTO public.profiles (id, email, full_name)
    VALUES (v_user_id, v_email, 'Margen Pizzaria')
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Link to company as owner
  INSERT INTO public.company_users (company_id, user_id, is_owner)
  VALUES (v_company_id, v_user_id, true)
  ON CONFLICT DO NOTHING;

  -- Assign company_admin role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'company_admin')
  ON CONFLICT DO NOTHING;
END $$;