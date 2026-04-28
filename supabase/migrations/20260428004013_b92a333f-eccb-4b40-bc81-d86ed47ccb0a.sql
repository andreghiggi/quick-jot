-- Índices de performance nas tabelas mais consultadas
-- Todos com IF NOT EXISTS para serem idempotentes
-- Sem CONCURRENTLY pois migrations rodam em transaction; tabelas são pequenas, criação é instantânea

-- ORDERS: filtrado o tempo todo por company_id + created_at e company_id + status
CREATE INDEX IF NOT EXISTS idx_orders_company_created 
  ON public.orders (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_company_status 
  ON public.orders (company_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_company_printed 
  ON public.orders (company_id, printed) WHERE printed = false;

-- ORDER_ITEMS: sempre buscado por order_id
CREATE INDEX IF NOT EXISTS idx_order_items_order 
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_company 
  ON public.order_items (company_id);

-- PDV_SALES: relatórios e listagens por company + data
CREATE INDEX IF NOT EXISTS idx_pdv_sales_company_created 
  ON public.pdv_sales (company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pdv_sales_cash_register 
  ON public.pdv_sales (cash_register_id);

-- PDV_SALE_ITEMS: sempre por sale_id
CREATE INDEX IF NOT EXISTS idx_pdv_sale_items_sale 
  ON public.pdv_sale_items (sale_id);

-- CUSTOMERS: lookup por (company_id, phone) é o caminho quente do checkout
CREATE INDEX IF NOT EXISTS idx_customers_company_phone 
  ON public.customers (company_id, phone);

-- NFCE_RECORDS: monitor fiscal filtra por company_id + status
CREATE INDEX IF NOT EXISTS idx_nfce_records_company_status 
  ON public.nfce_records (company_id, status);

CREATE INDEX IF NOT EXISTS idx_nfce_records_company_created 
  ON public.nfce_records (company_id, created_at DESC);

-- PRODUCTS: cardápio filtra por company_id + active
CREATE INDEX IF NOT EXISTS idx_products_company_active 
  ON public.products (company_id, active);

-- CATEGORIES: cardápio filtra por company_id + active
CREATE INDEX IF NOT EXISTS idx_categories_company_active 
  ON public.categories (company_id, active);

-- CASH_REGISTERS: PDV abre/lista por company_id + status
CREATE INDEX IF NOT EXISTS idx_cash_registers_company_status 
  ON public.cash_registers (company_id, status);

-- PRINT_QUEUE: scripts de impressão lêem por company_id + printed
CREATE INDEX IF NOT EXISTS idx_print_queue_company_printed 
  ON public.print_queue (company_id, printed) WHERE printed = false;

-- COMPANY_USERS: usado em quase todas as RLS via user_belongs_to_company
CREATE INDEX IF NOT EXISTS idx_company_users_user 
  ON public.company_users (user_id);

-- USER_ROLES: usado em quase todas as RLS via has_role
CREATE INDEX IF NOT EXISTS idx_user_roles_user 
  ON public.user_roles (user_id);

-- Atualiza estatísticas para o planner usar os novos índices imediatamente
ANALYZE public.orders;
ANALYZE public.order_items;
ANALYZE public.pdv_sales;
ANALYZE public.pdv_sale_items;
ANALYZE public.customers;
ANALYZE public.nfce_records;
ANALYZE public.products;
ANALYZE public.categories;
ANALYZE public.cash_registers;
ANALYZE public.print_queue;
ANALYZE public.company_users;
ANALYZE public.user_roles;