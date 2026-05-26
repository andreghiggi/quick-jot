
DO $$
DECLARE
  new_user_id uuid := gen_random_uuid();
  v_company_id uuid := '96e53bb2-2b71-4ed3-86cd-0f97858aca73';
  v_email text := 'cardapio@imperiodoacai.com';
  v_password text := '123456';
  v_name text := 'Império do Açaí';
BEGIN
  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token
  ) VALUES (
    '00000000-0000-0000-0000-000000000000', new_user_id, 'authenticated', 'authenticated',
    v_email, crypt(v_password, gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', v_name),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', v_email, 'email_verified', true),
    'email', v_email, now(), now(), now()
  );

  INSERT INTO public.profiles (id, email, full_name) VALUES (new_user_id, v_email, v_name)
    ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.company_users (company_id, user_id, is_owner)
  VALUES (v_company_id, new_user_id, true)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (new_user_id, 'company_admin')
  ON CONFLICT (user_id, role) DO NOTHING;
END $$;
