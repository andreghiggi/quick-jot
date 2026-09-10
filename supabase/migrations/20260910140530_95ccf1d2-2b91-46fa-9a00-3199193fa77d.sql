REVOKE EXECUTE ON FUNCTION public.sync_pdv_sale_counters() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_pdv_sale_counters() TO service_role;