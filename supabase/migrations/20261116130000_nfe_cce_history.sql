alter table public.nfe_records
  add column if not exists cce_history jsonb not null default '[]'::jsonb;
