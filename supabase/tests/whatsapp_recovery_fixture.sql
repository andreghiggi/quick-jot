-- Disposable test database ONLY. Never apply this fixture to Cloud or the VPS.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TYPE public.app_role AS ENUM ('super_admin');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.companies(id uuid PRIMARY KEY);
CREATE TABLE public.whatsapp_instances(instance_name text PRIMARY KEY,company_id uuid,status text);
CREATE TABLE public.company_modules(company_id uuid,module_name text,enabled boolean);
INSERT INTO public.companies VALUES('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002');
INSERT INTO public.whatsapp_instances VALUES('ct-fixture-a','00000000-0000-0000-0000-000000000001','connected'),('ct-fixture-b','00000000-0000-0000-0000-000000000002','connected');
INSERT INTO public.company_modules VALUES('00000000-0000-0000-0000-000000000001','whatsapp',true),('00000000-0000-0000-0000-000000000002','whatsapp',true);
