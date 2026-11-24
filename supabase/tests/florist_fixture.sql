-- Disposable database only; do not run on Cloud or VPS.
CREATE ROLE anon;
CREATE ROLE authenticated;
CREATE ROLE service_role;
CREATE SCHEMA auth;
CREATE TYPE public.order_status AS ENUM ('pending','preparing','ready','delivered','canceled');
CREATE TYPE public.app_role AS ENUM ('super_admin');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('test.actor',true),'')::uuid $$;
CREATE FUNCTION public.has_role(uuid,public.app_role) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
CREATE TABLE public.companies(id uuid PRIMARY KEY,reseller_id uuid);
CREATE TABLE public.company_modules(company_id uuid,module_name text,enabled boolean);
CREATE FUNCTION public.get_reseller_id(uuid) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.user_belongs_to_company(_user uuid,_company uuid) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT _user='00000000-0000-0000-0000-000000000001'::uuid AND _company='00000000-0000-0000-0000-000000000011'::uuid $$;
CREATE FUNCTION public.is_company_module_enabled(_company uuid,_module text) RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM public.company_modules WHERE company_id=_company AND module_name=_module AND enabled) $$;
CREATE TABLE public.orders(id uuid PRIMARY KEY,company_id uuid,status public.order_status DEFAULT 'pending',notes text,confirmed_at timestamptz,delivery_address text);
CREATE TABLE public.order_items(id uuid PRIMARY KEY,company_id uuid,order_id uuid,name text,quantity numeric,notes text);
INSERT INTO public.companies(id) VALUES('00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000022');
INSERT INTO public.company_modules VALUES('00000000-0000-0000-0000-000000000011','floricultura',true);
INSERT INTO public.orders(id,company_id) VALUES('00000000-0000-0000-0000-000000000100','00000000-0000-0000-0000-000000000011'),('00000000-0000-0000-0000-000000000200','00000000-0000-0000-0000-000000000022');
INSERT INTO public.order_items VALUES
 ('00000000-0000-0000-0000-000000000101','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','Buquê de 12 Rosas',1,'DESTINO 1: PRESENTE | Entrega 10/12/2026 09:00–12:00 | Recebe: Maria (51999887766) | Endereço: Rua A, 1 - Centro'),
 ('00000000-0000-0000-0000-000000000102','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','Buquê',1,'DESTINO 2: PRESENTE | Entrega 11/12/2026 14:00–16:00 | Recebe: Ana (51999887700) | Endereço: Rua B, 2 - Centro'),
 ('00000000-0000-0000-0000-000000000103','00000000-0000-0000-0000-000000000011','00000000-0000-0000-0000-000000000100','Vaso de Suculenta',1,'DESTINO 3: Para o comprador | Retirada na loja');
CREATE FUNCTION public.assert_test(_condition boolean,_description text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF _condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAILED: %',_description; END IF; RAISE NOTICE 'PASS: %',_description; END $$;