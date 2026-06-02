
DELETE FROM public.pdv_sale_items WHERE sale_id='ee9cec71-799a-4456-8b31-fa5845ae1748';
DELETE FROM public.pdv_sales WHERE id='ee9cec71-799a-4456-8b31-fa5845ae1748';
UPDATE public.orders
  SET paid_amount=0,
      payment_status='unpaid',
      paid_items=NULL,
      notes='Pagamento: PIX (Chave PIX: 54999061836) | Retirada'
  WHERE id='4cd7c18c-86bb-4b77-940b-c0045de9c1e5';
