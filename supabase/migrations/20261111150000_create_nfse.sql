-- NFS-e Nacional (padrão SEFIN/ADN) via Fiscal Flow (rota nfse-api).
-- Molde: nfe_records (mesma estrutura de proxy isolado, mesma política de RLS).

create table if not exists public.nfse_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  external_id text not null,
  api_id text,
  numero_dps text,
  numero_nfse text,
  serie text,
  chave_acesso text,
  protocolo text,
  status text not null default 'pendente',
  ambiente text default 'homologacao',
  codigo_retorno text,
  motivo_retorno text,
  valor_servicos numeric not null default 0,
  tomador jsonb,
  servico jsonb,
  xml_url text,
  danfse_url text,
  xml_nfse text,
  request_payload jsonb,
  response_payload jsonb,
  created_by uuid,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

create index if not exists idx_nfse_records_company on public.nfse_records (company_id, created_at desc);
create index if not exists idx_nfse_records_external on public.nfse_records (external_id);

alter table public.nfse_records enable row level security;

create policy "company members insert nfse_records"
  on public.nfse_records for insert
  to authenticated
  with check (user_belongs_to_company(auth.uid(), company_id));

create policy "company members read nfse_records"
  on public.nfse_records for select
  to authenticated
  using (user_belongs_to_company(auth.uid(), company_id));

create policy "company members update nfse_records"
  on public.nfse_records for update
  to authenticated
  using (user_belongs_to_company(auth.uid(), company_id))
  with check (user_belongs_to_company(auth.uid(), company_id));

create trigger trg_nfse_records_updated_at
  before update on public.nfse_records
  for each row execute function update_updated_at_column();

-- Configuração da empresa pra NFS-e -- mesmo lugar/convenção que nfe_* já usa.
alter table public.pdv_settings
  add column if not exists nfse_ambiente text default 'homologacao',
  add column if not exists nfse_serie text default '1',
  add column if not exists nfse_codigo_municipio text,
  -- 'mei' | 'simples_nacional' | 'normal' -- usado só pra pré-validação (compara
  -- com o que a Receita Federal tem registrado via BrasilAPI, evitando o erro
  -- 160 da SEFIN). Não existe em lugar nenhum do sistema ainda.
  add column if not exists nfse_regime_tributario text;
