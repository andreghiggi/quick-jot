-- Create enum for order status
CREATE TYPE public.order_status AS ENUM ('pending', 'preparing', 'ready', 'delivered');

-- Create products table
CREATE TABLE public.products (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create orders table
CREATE TABLE public.orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  delivery_address TEXT,
  notes TEXT,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  status order_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create order_items table
CREATE TABLE public.order_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  price DECIMAL(10,2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Create public read/write policies (for now without auth)
-- Products - public read, no public write
CREATE POLICY "Products are viewable by everyone" 
  ON public.products FOR SELECT 
  USING (true);

CREATE POLICY "Products can be inserted by anyone" 
  ON public.products FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Products can be updated by anyone" 
  ON public.products FOR UPDATE 
  USING (true);

-- Orders - public CRUD (since no auth yet)
CREATE POLICY "Orders are viewable by everyone" 
  ON public.orders FOR SELECT 
  USING (true);

CREATE POLICY "Orders can be created by anyone" 
  ON public.orders FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Orders can be updated by anyone" 
  ON public.orders FOR UPDATE 
  USING (true);

CREATE POLICY "Orders can be deleted by anyone" 
  ON public.orders FOR DELETE 
  USING (true);

-- Order Items - public CRUD
CREATE POLICY "Order items are viewable by everyone" 
  ON public.order_items FOR SELECT 
  USING (true);

CREATE POLICY "Order items can be created by anyone" 
  ON public.order_items FOR INSERT 
  WITH CHECK (true);

CREATE POLICY "Order items can be deleted by anyone" 
  ON public.order_items FOR DELETE 
  USING (true);

-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for orders table
ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;