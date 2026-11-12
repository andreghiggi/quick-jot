-- Trava de servidor: venda com pagamento TEF nunca pode ficar marcada como
-- "nao_fiscal" em pdv_sales, independente do que a tela mandar (cache
-- desatualizado, bug de tela, clique errado do operador etc.).
--
-- Contexto: em 12/11/2026 a Cozinha da Ruiva teve 2 vendas com TEF salvas
-- como pré-venda (fiscal_mode='nao_fiscal') porque a aba do navegador estava
-- rodando uma versão antiga do código (sem a trava que já existe no
-- frontend, commit 80857262). Essa trava aqui é independente de qualquer
-- versão de tela.
--
-- Auto-corrige (não bloqueia a venda): se vier um pagamento TEF associado
-- a uma venda marcada como não-fiscal, o gatilho corrige o rótulo pra
-- 'fiscal' antes de retornar. Não emite nota sozinho (isso é outra etapa).

create or replace function public.enforce_tef_requires_fiscal_mode()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.amount > 0 and new.integration in ('tef_pinpad', 'tef_smartpos') then
    update public.pdv_sales
      set fiscal_mode = 'fiscal'
      where id = new.sale_id
        and fiscal_mode <> 'fiscal';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_tef_fiscal_mode on public.pdv_sale_payments;

create trigger trg_enforce_tef_fiscal_mode
  after insert or update on public.pdv_sale_payments
  for each row
  execute function public.enforce_tef_requires_fiscal_mode();
