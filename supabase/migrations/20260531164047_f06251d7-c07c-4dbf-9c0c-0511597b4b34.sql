
-- 1. Coluna short_code
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS short_code TEXT;

-- 2. Tabela de contadores por (company_id, prefix)
CREATE TABLE IF NOT EXISTS public.order_short_code_counters (
  company_id UUID NOT NULL,
  prefix TEXT NOT NULL,
  next_value BIGINT NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, prefix)
);

GRANT ALL ON public.order_short_code_counters TO service_role;
ALTER TABLE public.order_short_code_counters ENABLE ROW LEVEL SECURITY;
-- Sem políticas: acesso apenas via SECURITY DEFINER trigger / service_role.

-- 3. Índice parcial garantindo unicidade entre pedidos ativos
CREATE UNIQUE INDEX IF NOT EXISTS orders_active_short_code_idx
  ON public.orders (company_id, short_code)
  WHERE short_code IS NOT NULL
    AND status IN ('pending', 'preparing', 'ready');

-- 4. Função que atribui short_code antes do insert
CREATE OR REPLACE FUNCTION public.assign_order_short_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_next BIGINT;
  v_candidate TEXT;
  v_attempts INT := 0;
  v_exists BOOLEAN;
BEGIN
  -- Se já vier preenchido (importação/migração), não sobrescreve
  IF NEW.short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Determina prefixo pela modalidade
  v_prefix := CASE
    WHEN NEW.origin = 'mesa' THEN 'M'
    WHEN NEW.origin = 'balcao' THEN 'B'
    WHEN NEW.origin = 'cardapio' AND NEW.delivery_address IS NOT NULL
         AND length(trim(NEW.delivery_address)) > 0 THEN 'D'
    WHEN NEW.origin = 'cardapio' THEN 'R'
    ELSE 'B'
  END;

  -- Loop: pega próximo número e garante que não colide com pedido ativo
  LOOP
    v_attempts := v_attempts + 1;
    EXIT WHEN v_attempts > 1100; -- proteção

    -- Upsert + incremento atômico do contador
    INSERT INTO public.order_short_code_counters (company_id, prefix, next_value)
    VALUES (NEW.company_id, v_prefix, 2)
    ON CONFLICT (company_id, prefix) DO UPDATE
      SET next_value = order_short_code_counters.next_value + 1,
          updated_at = now()
    RETURNING (next_value - 1) INTO v_next;

    v_candidate := v_prefix || '-' || LPAD(((v_next - 1) % 1000)::TEXT, 3, '0');

    -- Verifica se já existe pedido ativo com esse código
    SELECT EXISTS(
      SELECT 1 FROM public.orders
      WHERE company_id = NEW.company_id
        AND short_code = v_candidate
        AND status IN ('pending', 'preparing', 'ready')
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
  END LOOP;

  NEW.short_code := v_candidate;
  RETURN NEW;
END;
$$;

-- 5. Trigger
DROP TRIGGER IF EXISTS trg_assign_order_short_code ON public.orders;
CREATE TRIGGER trg_assign_order_short_code
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_order_short_code();
