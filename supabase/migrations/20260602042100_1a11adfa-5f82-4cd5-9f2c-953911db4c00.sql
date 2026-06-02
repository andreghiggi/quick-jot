-- Multiple addresses per customer (cardápio online)
CREATE TABLE IF NOT EXISTS public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  company_id uuid NOT NULL,
  label text,
  address text,
  number text,
  complement text,
  neighborhood text,
  reference text,
  city text,
  state text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer
  ON public.customer_addresses (customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_addresses_company
  ON public.customer_addresses (company_id);

-- Grants — público (anon) precisa ler/inserir/atualizar/deletar para o checkout do cardápio
-- (mesmo padrão das policies de `customers`, que já são públicas hoje).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.customer_addresses TO authenticated;
GRANT ALL ON public.customer_addresses TO service_role;

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

-- Mesmo modelo de RLS de `customers`: público para o checkout, e empresa para gestão interna.
CREATE POLICY "Customer addresses readable publicly"
  ON public.customer_addresses FOR SELECT
  USING (true);

CREATE POLICY "Customer addresses insertable publicly"
  ON public.customer_addresses FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Customer addresses updatable publicly"
  ON public.customer_addresses FOR UPDATE
  USING (true);

CREATE POLICY "Customer addresses deletable publicly"
  ON public.customer_addresses FOR DELETE
  USING (true);

CREATE POLICY "Company users manage customer addresses"
  ON public.customer_addresses FOR ALL
  USING (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (user_belongs_to_company(auth.uid(), company_id) OR has_role(auth.uid(), 'super_admin'::app_role));

CREATE TRIGGER update_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Backfill: para cada customer com endereço atual, cria 1 entrada como default
INSERT INTO public.customer_addresses (
  customer_id, company_id, address, number, complement, neighborhood, reference, city, state, is_default
)
SELECT
  c.id,
  c.company_id,
  -- Parse do formato i9: "Logradouro, Número - Complemento - Bairro | Ref: Referência"
  -- Mantém simples: salva tudo no campo `address` quando o parser for ambíguo.
  c.address,
  NULL,
  NULL,
  NULL,
  NULL,
  c.city,
  c.state,
  true
FROM public.customers c
WHERE c.address IS NOT NULL
  AND length(trim(c.address)) > 0
  AND c.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.customer_addresses ca WHERE ca.customer_id = c.id
  );