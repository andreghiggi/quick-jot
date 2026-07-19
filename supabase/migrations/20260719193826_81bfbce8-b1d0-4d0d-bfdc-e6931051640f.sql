
CREATE OR REPLACE FUNCTION public.ensure_credit_receipt_tax_rule(_company_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule_id uuid;
BEGIN
  SELECT id INTO v_rule_id
  FROM public.tax_rules
  WHERE company_id = _company_id AND name = 'Quitação de Crediário'
  LIMIT 1;

  IF v_rule_id IS NULL THEN
    INSERT INTO public.tax_rules (
      company_id, name, description, active,
      cfop, ncm, csosn, icms_origin, icms_aliquot,
      pis_cst, pis_aliquot, cofins_cst, cofins_aliquot,
      ipi_cst, ipi_aliquot
    ) VALUES (
      _company_id,
      'Quitação de Crediário',
      'NFC-e financeira de recebimento de crediário (CFOP 5949 · CSOSN 900 · PIS/COFINS CST 49). Editável.',
      true,
      '5949', '00000000', '900', '0', 0,
      '49', 0, '49', 0,
      '49', 0
    )
    RETURNING id INTO v_rule_id;
  END IF;

  UPDATE public.pdv_settings
     SET credit_receipt_tax_rule_id = v_rule_id,
         updated_at = now()
   WHERE company_id = _company_id
     AND credit_receipt_tax_rule_id IS NULL;

  RETURN v_rule_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.on_financeiro_module_enabled()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.module_name = 'financeiro' AND COALESCE(NEW.enabled, false) = true
     AND (TG_OP = 'INSERT' OR COALESCE(OLD.enabled, false) = false) THEN
    PERFORM public.ensure_credit_receipt_tax_rule(NEW.company_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_financeiro_module_enabled ON public.company_modules;
CREATE TRIGGER trg_financeiro_module_enabled
AFTER INSERT OR UPDATE ON public.company_modules
FOR EACH ROW EXECUTE FUNCTION public.on_financeiro_module_enabled();

-- Backfill: cria a regra para todas as empresas que já têm financeiro ativo
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT company_id FROM public.company_modules
           WHERE module_name = 'financeiro' AND enabled = true
  LOOP
    PERFORM public.ensure_credit_receipt_tax_rule(r.company_id);
  END LOOP;
END $$;
