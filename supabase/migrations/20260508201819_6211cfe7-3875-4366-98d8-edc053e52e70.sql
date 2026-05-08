-- Trigger: garantir exclusividade entre pdv_v1 e pdv_v2 em company_modules.
-- Sempre que um for habilitado, o outro é desabilitado automaticamente.
CREATE OR REPLACE FUNCTION public.enforce_pdv_exclusivity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  other_module text;
BEGIN
  -- Só age quando o módulo está sendo ativado e é um dos dois PDVs
  IF NEW.module_name NOT IN ('pdv_v1', 'pdv_v2') THEN
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.enabled, false) = false THEN
    RETURN NEW;
  END IF;

  other_module := CASE NEW.module_name
    WHEN 'pdv_v1' THEN 'pdv_v2'
    WHEN 'pdv_v2' THEN 'pdv_v1'
  END;

  -- Atualiza o "outro" PDV para desativado, se já existir registro
  UPDATE public.company_modules
     SET enabled = false,
         updated_at = now()
   WHERE company_id = NEW.company_id
     AND module_name = other_module
     AND enabled = true;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_pdv_exclusivity ON public.company_modules;
CREATE TRIGGER trg_enforce_pdv_exclusivity
BEFORE INSERT OR UPDATE ON public.company_modules
FOR EACH ROW
EXECUTE FUNCTION public.enforce_pdv_exclusivity();

-- Normalização: para qualquer empresa que tenha AMBOS ativos hoje, prevalece pdv_v2
-- (consistente com o estado validado da Lancheria I9).
UPDATE public.company_modules cm1
   SET enabled = false,
       updated_at = now()
 WHERE cm1.module_name = 'pdv_v1'
   AND cm1.enabled = true
   AND EXISTS (
     SELECT 1 FROM public.company_modules cm2
      WHERE cm2.company_id = cm1.company_id
        AND cm2.module_name = 'pdv_v2'
        AND cm2.enabled = true
   );