UPDATE public.orders o
SET notes = o.notes || ' | ' || regexp_replace(s.notes, '^\[CARDAPIO #[^\]]+\] Pagamento: [^|]+\| ', '')
FROM public.pdv_sales s
WHERE o.id = 'a88276ea-c138-4107-b3f0-274326c59bc2'
  AND s.order_id = o.id
  AND s.notes LIKE '%TEF PinPad:%'
  AND o.notes NOT LIKE '%TEF PinPad:%';