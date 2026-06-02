
DELETE FROM public.pdv_sale_items WHERE sale_id='77dc14d3-0d3b-4a1e-94f6-5e2a9fed3f23';
DELETE FROM public.pdv_sales WHERE id='77dc14d3-0d3b-4a1e-94f6-5e2a9fed3f23';
UPDATE public.orders
  SET paid_amount=0,
      payment_status='unpaid',
      paid_items=NULL,
      notes='Pagamento: PIX (Chave PIX: 54999061836) | Retirada'
  WHERE id='4cd7c18c-86bb-4b77-940b-c0045de9c1e5';
