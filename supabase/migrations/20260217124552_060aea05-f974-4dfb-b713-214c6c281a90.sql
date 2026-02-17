
-- Add order_code column for random alphanumeric order identifiers
ALTER TABLE public.orders ADD COLUMN order_code TEXT;

-- Generate random alphanumeric codes for existing orders
UPDATE public.orders 
SET order_code = UPPER(SUBSTR(MD5(RANDOM()::TEXT || id::TEXT), 1, 3) || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0'))
WHERE order_code IS NULL;

-- Make order_code NOT NULL with a default
ALTER TABLE public.orders ALTER COLUMN order_code SET DEFAULT UPPER(SUBSTR(MD5(RANDOM()::TEXT), 1, 6));
ALTER TABLE public.orders ALTER COLUMN order_code SET NOT NULL;

-- Create a function to generate random order codes
CREATE OR REPLACE FUNCTION public.generate_order_code()
RETURNS TRIGGER AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
BEGIN
  LOOP
    -- Generate a 6-character alphanumeric code (letters + numbers)
    new_code := UPPER(
      CHR(65 + FLOOR(RANDOM() * 26)::INT) ||
      LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0') ||
      CHR(65 + FLOOR(RANDOM() * 26)::INT) ||
      CHR(48 + FLOOR(RANDOM() * 10)::INT)
    );
    
    -- Check if code already exists for same company today
    SELECT EXISTS(
      SELECT 1 FROM public.orders
      WHERE order_code = new_code 
        AND company_id = NEW.company_id
        AND created_at >= date_trunc('day', NOW() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
    ) INTO code_exists;
    
    EXIT WHEN NOT code_exists;
  END LOOP;
  
  NEW.order_code := new_code;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger to auto-generate order codes
CREATE TRIGGER set_order_code
  BEFORE INSERT ON public.orders
  FOR EACH ROW
  WHEN (NEW.order_code IS NULL OR NEW.order_code = '')
  EXECUTE FUNCTION public.generate_order_code();
