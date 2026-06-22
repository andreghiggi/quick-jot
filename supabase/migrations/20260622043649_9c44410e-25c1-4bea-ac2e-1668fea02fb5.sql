-- Amplia purchase_invoices para suportar cadastro manual de nota de compra
-- (estilo GWeb): cabeçalho completo (modelo, série, entrada, natureza),
-- transporte, pagamentos e status de rascunho.
-- Tabela já existe com RLS configurado; aqui só adicionamos colunas
-- opcionais (sem quebrar registros vindos do XML).

ALTER TABLE public.purchase_invoices
  ADD COLUMN IF NOT EXISTS modelo text DEFAULT '55',
  ADD COLUMN IF NOT EXISTS data_entrada timestamp with time zone,
  ADD COLUMN IF NOT EXISTS natureza_operacao text DEFAULT 'Compra de mercadorias',
  ADD COLUMN IF NOT EXISTS tipo_frete text DEFAULT 'sem_transporte',
  ADD COLUMN IF NOT EXISTS pagamentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'xml';

-- origem: 'xml' (importado via DF-e/upload XML) | 'manual' (cadastrado na tela Nova Compra)
-- status: já existe com default 'lancada'. Manual pode usar 'rascunho' ou 'lancada'.

COMMENT ON COLUMN public.purchase_invoices.origem IS 'xml = importada via DF-e/upload; manual = cadastrada na tela Nova Compra';
COMMENT ON COLUMN public.purchase_invoices.pagamentos IS 'JSON array: [{forma, valor, parcelas, vencimento}]';
COMMENT ON COLUMN public.purchase_invoices.tipo_frete IS 'sem_transporte | emitente | destinatario | terceiros | proprio_remetente | proprio_destinatario';