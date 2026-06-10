import { useNavigate } from 'react-router-dom';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  onSangria: () => void;
  onSuprimento: () => void;
  onLista?: () => void;
  onInutilizarNfce?: () => void;
  onXmlMes?: () => void;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}

type Item = {
  /** Label completa do item. */
  label: string;
  /** Índice (0-based) da letra a ser sublinhada como atalho visual estilo GWeb. */
  accel?: number;
  onClick: () => void;
  disabled?: boolean;
  hint?: string; // ex.: "Desativado", "Em breve"
};

/** Renderiza o label com uma letra sublinhada (padrão GWeb). */
function AccelLabel({ label, accel = 0 }: { label: string; accel?: number }) {
  if (accel < 0 || accel >= label.length) return <>{label}</>;
  return (
    <>
      {label.slice(0, accel)}
      <span className="underline">{label[accel]}</span>
      {label.slice(accel + 1)}
    </>
  );
}

/**
 * Rail lateral fixo à direita (estilo Gweb). Não é Sheet/modal: fica
 * sempre encostado na borda direita do viewport, com setinha »/« para
 * expandir/recolher. Atalho F10 alterna o estado (controlado pelo pai).
 *
 * Seções em cards brancos: Acessar, Ações, Configurações.
 * Itens usam letra sublinhada como dica visual de atalho (estilo Gweb).
 */
export function FrenteCaixaActionsMenu({
  onSangria,
  onSuprimento,
  onLista,
  onInutilizarNfce,
  onXmlMes,
  open = false,
  onOpenChange,
}: Props) {
  const navigate = useNavigate();
  const toggle = () => onOpenChange?.(!open);

  const Section = ({ title, items }: { title: string; items: Item[] }) => (
    <div className="rounded-md bg-card border shadow-sm overflow-hidden">
      <p className="px-4 pt-3 pb-1 text-[12px] text-muted-foreground">{title}</p>
      <ul className="pb-2">
        {items.map((it) => (
          <li key={it.label}>
            <button
              type="button"
              disabled={it.disabled}
              onClick={() => {
                if (it.disabled) return;
                it.onClick();
              }}
              className={cn(
                'w-full text-left px-4 py-1.5 text-[15px] transition-colors',
                'hover:bg-accent hover:text-accent-foreground',
                it.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent',
              )}
            >
              <AccelLabel label={it.label} accel={it.accel ?? 0} />
              {it.hint && (
                <span className="ml-1.5 text-xs text-muted-foreground">({it.hint})</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <>
      {/* Aba para expandir/recolher — visível em todos os estados, fixa na borda direita */}
      <button
        type="button"
        onClick={toggle}
        title={open ? 'Recolher menu (F10)' : 'Expandir menu (F10)'}
        aria-label={open ? 'Recolher menu' : 'Expandir menu'}
        className={cn(
          'fixed top-1/2 -translate-y-1/2 z-40 h-12 w-6 rounded-l-md bg-card border border-r-0 shadow-sm',
          'flex items-center justify-center text-muted-foreground hover:bg-accent transition-all',
          open ? 'right-80' : 'right-0',
        )}
      >
        {open ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
      </button>

      {/* Rail lateral fixo — fica encostado no canto direito, slide-in/out */}
      <aside
        className={cn(
          'fixed top-0 right-0 bottom-0 z-30 w-80 bg-muted/40 border-l p-3 overflow-y-auto transition-transform',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        aria-hidden={!open}
      >
        <div className="space-y-3 pt-2 pb-24">
          <Section
            title="Acessar"
            items={[
              { label: 'Pedidos', accel: 0, onClick: () => navigate('/pedidos') },
              { label: 'Clientes', accel: 0, onClick: () => navigate('/clientes') },
              { label: 'Produtos', accel: 0, onClick: () => navigate('/produtos') },
              { label: 'Estoque', accel: 0, onClick: () => navigate('/estoque') },
              { label: 'Relatório de Caixa', accel: 0, onClick: () => navigate('/relatorios/caixa') },
              { label: 'NFC-e Monitor', accel: 5, onClick: () => navigate('/nfce') },
            ]}
          />

          <Section
            title="Ações"
            items={[
              { label: 'Inutilizar numeração', accel: 0, onClick: onInutilizarNfce ?? (() => {}), disabled: !onInutilizarNfce },
              { label: 'XML do mês', accel: 0, onClick: onXmlMes ?? (() => {}), disabled: !onXmlMes },
              { label: 'Contingência', accel: 0, onClick: () => {}, disabled: true, hint: 'Desativado' },
              { label: 'Sangria', accel: 0, onClick: onSangria },
              { label: 'Suprimento', accel: 0, onClick: onSuprimento },
              { label: 'Lista do PDV', accel: 0, onClick: onLista ?? (() => navigate('/frente-caixa/lista')) },
              { label: 'Rel. de fechamento', accel: 5, onClick: () => navigate('/relatorios/caixa') },
            ]}
          />

          <Section
            title="Configurações"
            items={[
              { label: 'Configurações do PDV', accel: 0, onClick: () => navigate('/frente-caixa/configuracoes') },
              { label: 'Configurações da NFC-e', accel: 2, onClick: () => navigate('/configuracoes') },
              { label: 'Preferências', accel: 0, onClick: () => navigate('/configuracoes') },
              { label: 'Formas de pagamento', accel: 0, onClick: () => navigate('/formas-pagamento') },
              { label: 'Impressão', accel: 0, onClick: () => navigate('/configuracoes/impressao') },
            ]}
          />
        </div>
      </aside>
    </>
  );
}