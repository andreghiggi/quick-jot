import { useNavigate } from 'react-router-dom';
import {
  Menu,
  ArrowUpFromLine,
  ArrowDownToLine,
  List,
  Receipt,
  FileX2,
  FileArchive,
  Settings,
  CreditCard,
  Printer,
  Users,
  Package,
  Boxes,
  CircleDollarSign,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';

interface Props {
  onSangria: () => void;
  onSuprimento: () => void;
  onLista?: () => void;
  onInutilizarNfce?: () => void;
  onXmlMes?: () => void;
}

/**
 * Menu lateral (Sheet à direita) com os atalhos no estilo do Gweb:
 * - Acessar (navegação rápida para módulos relacionados)
 * - Ações (sangria, suprimento, lista do PDV, inutilizar NFC-e, XML do mês)
 * - Configurações (formas de pagamento, impressão, clientes, produtos, estoque)
 *
 * Acessível por botão no header e por atalho <kbd>F10</kbd>.
 */
export function FrenteCaixaActionsMenu({
  onSangria,
  onSuprimento,
  onLista,
  onInutilizarNfce,
  onXmlMes,
}: Props) {
  const navigate = useNavigate();

  const block = (
    title: string,
    items: { label: string; icon: any; onClick: () => void; shortcut?: string; soon?: boolean }[],
  ) => (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground px-2">
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((it) => (
          <li key={it.label}>
            <button
              type="button"
              disabled={it.soon}
              onClick={() => {
                if (it.soon) return;
                it.onClick();
              }}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <it.icon className="h-4 w-4 text-muted-foreground" />
              <span className="flex-1 text-left">{it.label}</span>
              {it.soon && (
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">em breve</span>
              )}
              {it.shortcut && !it.soon && (
                <kbd className="px-1.5 py-0.5 border rounded text-[10px] bg-muted">
                  {it.shortcut}
                </kbd>
              )}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Menu className="h-4 w-4" />
          Menu
          <kbd className="ml-1 px-1 py-0.5 border rounded text-[10px] bg-muted">F10</kbd>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-80 sm:w-96">
        <SheetHeader>
          <SheetTitle>Menu da Frente de Caixa</SheetTitle>
          <SheetDescription>
            Atalhos para operações de caixa, fiscais e configurações.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5">
          {block('Acessar', [
            { label: 'Pedidos', icon: Receipt, onClick: () => navigate('/pedidos') },
            { label: 'Clientes', icon: Users, onClick: () => navigate('/clientes') },
            { label: 'Produtos', icon: Package, onClick: () => navigate('/produtos') },
            { label: 'Estoque', icon: Boxes, onClick: () => navigate('/estoque') },
            { label: 'Relatório de Caixa', icon: CircleDollarSign, onClick: () => navigate('/relatorios/caixa') },
            { label: 'NFC-e Monitor', icon: Receipt, onClick: () => navigate('/nfce') },
          ])}

          <Separator />

          {block('Ações', [
            { label: 'Suprimento', icon: ArrowDownToLine, onClick: onSuprimento, shortcut: 'F6' },
            { label: 'Sangria', icon: ArrowUpFromLine, onClick: onSangria, shortcut: 'F7' },
            { label: 'Lista do PDV', icon: List, onClick: onLista ?? (() => {}), soon: !onLista },
            { label: 'Inutilizar NFC-e', icon: FileX2, onClick: onInutilizarNfce ?? (() => {}), soon: !onInutilizarNfce },
            { label: 'XML do mês', icon: FileArchive, onClick: onXmlMes ?? (() => {}), soon: !onXmlMes },
          ])}

          <Separator />

          {block('Configurações', [
            { label: 'Formas de pagamento', icon: CreditCard, onClick: () => navigate('/formas-pagamento') },
            { label: 'Impressão', icon: Printer, onClick: () => navigate('/configuracoes/impressao') },
            { label: 'Geral', icon: Settings, onClick: () => navigate('/configuracoes') },
          ])}
        </div>
      </SheetContent>
    </Sheet>
  );
}