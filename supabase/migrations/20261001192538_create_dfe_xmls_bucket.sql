-- O bucket 'dfe-xmls' nunca foi criado nesta instancia self-hosted (as policies
-- de RLS ja existiam desde a migration 20260621063804, so a criacao do bucket
-- em si ficou faltando). Sem o bucket, toda tentativa de importar XML por DFe
-- Manifestacao falha no upload com erro generico "Edge Function returned a
-- non-2xx status code" -- afeta qualquer empresa usando a feature, nao so uma.
insert into storage.buckets (id, name, public)
values ('dfe-xmls', 'dfe-xmls', false)
on conflict (id) do nothing;
