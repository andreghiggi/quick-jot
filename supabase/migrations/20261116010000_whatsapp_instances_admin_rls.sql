-- No Modo Suporte (super admin) e para revendedores, a leitura de whatsapp_instances
-- voltava vazia, porque so existiam policies para membros da empresa. A tela de
-- Configuracoes > WhatsApp mostrava "Nenhuma instancia conectada" mesmo com a loja
-- conectada. Mesmo padrao ja usado em company_modules.
DROP POLICY IF EXISTS "Super admins can manage all whatsapp instances" ON public.whatsapp_instances;
CREATE POLICY "Super admins can manage all whatsapp instances"
  ON public.whatsapp_instances
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'super_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'super_admin'::public.app_role));

DROP POLICY IF EXISTS "Resellers can view their companies whatsapp instances" ON public.whatsapp_instances;
CREATE POLICY "Resellers can view their companies whatsapp instances"
  ON public.whatsapp_instances
  FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = whatsapp_instances.company_id
      AND c.reseller_id = public.get_reseller_id(auth.uid())
  ));
