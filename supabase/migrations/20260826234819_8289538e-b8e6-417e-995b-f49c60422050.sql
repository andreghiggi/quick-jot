ALTER TABLE public.order_short_code_counters
  ADD COLUMN IF NOT EXISTS counter_date DATE;

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
  v_daily BOOLEAN;
  v_today DATE;
BEGIN
  IF NEW.short_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Lojas com reinício diário da numeração (rollout isolado)
  v_daily := NEW.company_id = 'f5f9eec3-67bc-497a-88a6-ce41d3b15df8'::uuid;
  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_prefix := CASE
    WHEN NEW.origin = 'mesa' THEN 'M'
    WHEN NEW.origin = 'balcao' THEN 'B'
    WHEN NEW.origin = 'cardapio' AND NEW.delivery_address IS NOT NULL
         AND length(trim(NEW.delivery_address)) > 0 THEN 'D'
    WHEN NEW.origin = 'cardapio' THEN 'R'
    ELSE 'B'
  END;

  LOOP
    v_attempts := v_attempts + 1;
    EXIT WHEN v_attempts > 1100;

    IF v_daily THEN
      INSERT INTO public.order_short_code_counters (company_id, prefix, next_value, counter_date)
      VALUES (NEW.company_id, v_prefix, 2, v_today)
      ON CONFLICT (company_id, prefix) DO UPDATE
        SET next_value = CASE
              WHEN order_short_code_counters.counter_date IS DISTINCT FROM v_today THEN 2
              ELSE order_short_code_counters.next_value + 1
            END,
            counter_date = v_today,
            updated_at = now()
      RETURNING (next_value - 1) INTO v_next;
    ELSE
      INSERT INTO public.order_short_code_counters (company_id, prefix, next_value)
      VALUES (NEW.company_id, v_prefix, 2)
      ON CONFLICT (company_id, prefix) DO UPDATE
        SET next_value = order_short_code_counters.next_value + 1,
            updated_at = now()
      RETURNING (next_value - 1) INTO v_next;
    END IF;

    IF v_daily THEN
      v_candidate := v_prefix || '-' || LPAD((((v_next - 1) % 999) + 1)::TEXT, 3, '0');
    ELSE
      v_candidate := v_prefix || '-' || LPAD(((v_next - 1) % 1000)::TEXT, 3, '0');
    END IF;

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