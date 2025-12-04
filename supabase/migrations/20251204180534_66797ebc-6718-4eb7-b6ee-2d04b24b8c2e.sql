-- Create product_optionals table for extras and variations
CREATE TABLE public.product_optionals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC NOT NULL DEFAULT 0,
  type TEXT NOT NULL CHECK (type IN ('extra', 'variation')),
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.product_optionals ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no auth yet)
CREATE POLICY "Product optionals are viewable by everyone" 
ON public.product_optionals FOR SELECT USING (true);

CREATE POLICY "Product optionals can be created by anyone" 
ON public.product_optionals FOR INSERT WITH CHECK (true);

CREATE POLICY "Product optionals can be updated by anyone" 
ON public.product_optionals FOR UPDATE USING (true);

CREATE POLICY "Product optionals can be deleted by anyone" 
ON public.product_optionals FOR DELETE USING (true);