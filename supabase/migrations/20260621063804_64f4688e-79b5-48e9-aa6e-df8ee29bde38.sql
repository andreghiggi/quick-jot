
CREATE POLICY "Usuários leem XMLs DFe da própria empresa"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'dfe-xmls'
    AND public.user_belongs_to_company(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Usuários enviam XMLs DFe da própria empresa"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'dfe-xmls'
    AND public.user_belongs_to_company(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "Usuários atualizam XMLs DFe da própria empresa"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'dfe-xmls'
    AND public.user_belongs_to_company(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
