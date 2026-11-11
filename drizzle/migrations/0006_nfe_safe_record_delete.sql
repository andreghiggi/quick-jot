GRANT DELETE ON public.nfe_records TO authenticated;
DROP POLICY IF EXISTS "company members delete unissued nfe_records" ON public.nfe_records;
CREATE POLICY "company members delete unissued nfe_records" ON public.nfe_records FOR DELETE TO authenticated USING (public.user_belongs_to_company(auth.uid(), company_id) AND status IN ('rascunho', 'rejeitada') AND chave_acesso IS NULL AND protocolo IS NULL);
NOTIFY pgrst, 'reload schema';