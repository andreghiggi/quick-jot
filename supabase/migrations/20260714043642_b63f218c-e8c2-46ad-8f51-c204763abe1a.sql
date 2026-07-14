
-- 1) Novos campos em pdv_settings
ALTER TABLE public.pdv_settings
  ADD COLUMN IF NOT EXISTS credit_sale_fiscal_mode text NOT NULL DEFAULT 'on_sale'
    CHECK (credit_sale_fiscal_mode IN ('on_sale','on_receipt')),
  ADD COLUMN IF NOT EXISTS credit_receipt_tax_rule_id uuid NULL
    REFERENCES public.tax_rules(id) ON DELETE SET NULL;

-- 2) Seed da regra "Recebimento de Crediário" para cada empresa que tem pdv_settings
--    (editável — o operador pode alterar depois)
INSERT INTO public.tax_rules
  (company_id, name, cfop, ncm, csosn, icms_origin, icms_aliquot,
   pis_cst, pis_aliquot, cofins_cst, cofins_aliquot, ipi_cst, ipi_aliquot,
   cest, description, active)
SELECT DISTINCT ps.company_id,
       'Recebimento de Crediário',
       '5949', '00000000', '400', '0', 0,
       '49', 0, '49', 0, '99', 0,
       NULL,
       'Regra usada nas notas financeiras (CFOP 5949/6949) emitidas ao receber parcelas de crediário via TEF. Não movimenta estoque.',
       true
FROM public.pdv_settings ps
WHERE NOT EXISTS (
  SELECT 1 FROM public.tax_rules tr
  WHERE tr.company_id = ps.company_id
    AND tr.name = 'Recebimento de Crediário'
);

-- 3) Aponta credit_receipt_tax_rule_id para a regra recém-criada quando estiver nulo
UPDATE public.pdv_settings ps
SET credit_receipt_tax_rule_id = tr.id
FROM public.tax_rules tr
WHERE tr.company_id = ps.company_id
  AND tr.name = 'Recebimento de Crediário'
  AND ps.credit_receipt_tax_rule_id IS NULL;
