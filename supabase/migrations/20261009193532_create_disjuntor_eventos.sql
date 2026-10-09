-- "Disjuntor" (circuit breaker) contra tempestade de requisicoes à API
-- (ver src/utils/apiStormGuard.ts). Confirmado em 9 dias de log (01-09/10)
-- que pelo menos 9 lojas diferentes sofrem rajadas de 100+ req/s repetindo
-- as mesmas consultas basicas, sem causa raiz identificada ainda no codigo.
-- Esta tabela registra, toda vez que o disjuntor dispara, um diagnostico
-- (quais endpoints repetiram, estado da aba, etc.) pra investigar a causa
-- real na proxima ocorrencia em vez de so pausar e perder a pista.
create table if not exists public.disjuntor_eventos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  user_id uuid,
  triggered_at timestamptz not null default now(),
  requests_in_window integer not null,
  window_ms integer not null,
  sample_urls text[],
  page_url text,
  visibility_state text,
  online boolean,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists idx_disjuntor_eventos_company_time
  on public.disjuntor_eventos (company_id, triggered_at desc);

alter table public.disjuntor_eventos enable row level security;

-- Qualquer sessao (autenticada ou anon) pode registrar um disparo do
-- disjuntor -- o proprio disjuntor roda antes de sabermos se a sessao ainda
-- esta saudavel, entao nao da pra exigir auth "normal" aqui.
create policy "Qualquer sessao pode registrar evento do disjuntor"
  on public.disjuntor_eventos for insert
  to anon, authenticated
  with check (true);

-- Leitura restrita: só quem pertence à própria empresa, ou super_admin
-- (pra investigar entre lojas sem precisar de acesso direto ao banco).
create policy "Usuarios leem eventos da propria empresa; super_admin le tudo"
  on public.disjuntor_eventos for select
  to authenticated
  using (
    (company_id is not null and public.user_belongs_to_company(auth.uid(), company_id))
    or public.has_role(auth.uid(), 'super_admin'::app_role)
  );
