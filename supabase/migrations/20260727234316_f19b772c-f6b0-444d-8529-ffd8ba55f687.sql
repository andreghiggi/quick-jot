
-- =========================================================
-- Módulo PinPDV — Infra v1 (cadastro de terminais)
-- Não altera nenhum fluxo TEF/PinPad existente.
-- =========================================================

-- 1) Terminais PinPDV cadastrados por empresa
CREATE TABLE IF NOT EXISTS public.pinpdv_terminals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  serial text NOT NULL,
  apelido text,
  default_cash_register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, serial)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinpdv_terminals TO authenticated;
GRANT ALL ON public.pinpdv_terminals TO service_role;

ALTER TABLE public.pinpdv_terminals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pinpdv_terminals_select_own_company"
  ON public.pinpdv_terminals FOR SELECT TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id));

CREATE POLICY "pinpdv_terminals_admin_manage"
  ON public.pinpdv_terminals FOR ALL TO authenticated
  USING (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
  )
  WITH CHECK (
    public.user_belongs_to_company(auth.uid(), company_id)
    AND (public.has_role(auth.uid(), 'company_admin') OR public.has_role(auth.uid(), 'super_admin'))
  );

CREATE TRIGGER pinpdv_terminals_updated_at
  BEFORE UPDATE ON public.pinpdv_terminals
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Trava efêmera por terminal (scaffold v1.1 — ainda não usada em runtime)
CREATE TABLE IF NOT EXISTS public.pinpdv_terminal_locks (
  terminal_id uuid PRIMARY KEY REFERENCES public.pinpdv_terminals(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  cash_register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL,
  external_id text,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '90 seconds')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pinpdv_terminal_locks TO authenticated;
GRANT ALL ON public.pinpdv_terminal_locks TO service_role;

ALTER TABLE public.pinpdv_terminal_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pinpdv_terminal_locks_own_company"
  ON public.pinpdv_terminal_locks FOR ALL TO authenticated
  USING (public.user_belongs_to_company(auth.uid(), company_id))
  WITH CHECK (public.user_belongs_to_company(auth.uid(), company_id));

-- 3) Ativa módulo pinpdv_v1 apenas na Margen Pizzaria
INSERT INTO public.company_modules (company_id, module_name, enabled)
VALUES ('a0071b86-6f2a-43f5-80d9-26e3ecd4b70c', 'pinpdv_v1', true)
ON CONFLICT (company_id, module_name) DO UPDATE SET enabled = EXCLUDED.enabled, updated_at = now();
