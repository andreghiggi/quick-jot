-- ORDERS
CREATE INDEX IF NOT EXISTS idx_orders_company_created
  ON public.orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_company_status
  ON public.orders (company_id, status);

-- ORDER_ITEMS (mais crítico — 196M de linhas escaneadas hoje)
CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_company_created
  ON public.order_items (company_id, created_at);

-- PRODUCTS
CREATE INDEX IF NOT EXISTS idx_products_company_active
  ON public.products (company_id, active);

-- PRODUCT_OPTIONALS
CREATE INDEX IF NOT EXISTS idx_product_optionals_product_id
  ON public.product_optionals (product_id);

-- OPTIONAL_GROUP_ITEMS
CREATE INDEX IF NOT EXISTS idx_optional_group_items_group_id
  ON public.optional_group_items (group_id);

-- PDV_SALE_ITEMS
CREATE INDEX IF NOT EXISTS idx_pdv_sale_items_sale_id
  ON public.pdv_sale_items (sale_id);

-- WHATSAPP_MESSAGES (tabela maior — 4.7MB)
CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_company_created
  ON public.whatsapp_messages (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_phone
  ON public.whatsapp_messages (phone);

CREATE INDEX IF NOT EXISTS idx_whatsapp_messages_order_id
  ON public.whatsapp_messages (order_id);

-- TAB_ITEMS
CREATE INDEX IF NOT EXISTS idx_tab_items_tab_id
  ON public.tab_items (tab_id);
