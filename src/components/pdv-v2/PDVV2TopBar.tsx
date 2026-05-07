import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Eye, EyeOff, Plus, DoorClosed } from 'lucide-react';
import { brl as formatPrice } from './_format';

interface PDVV2TopBarProps {
  storeName: string;
  cashOpen: boolean;
  /** Quando true, esconde o badge e o bloco de "Em caixa" para evitar flash. */
  cashStateUnknown?: boolean;
  cashAmount: number;
  showCashAmount: boolean;
  onToggleCashAmount: () => void;
  onCloseCash: () => void;
  onNewOrder: () => void;
  companyId?: string;
}



export function PDVV2TopBar({
  storeName,
  cashOpen,
  cashStateUnknown = false,
  cashAmount,
  showCashAmount,
  onToggleCashAmount,
  onCloseCash,
  onNewOrder,
  companyId,
}: PDVV2TopBarProps) {
  const newOrderLabel = 'Pedido Express';
  const newOrderBtn = (
    <Button
      size="sm"
      onClick={onNewOrder}
      disabled={!cashOpen}
      className="bg-destructive hover:bg-destructive/90 text-destructive-foreground disabled:opacity-50"
    >
      <Plus className="h-4 w-4 mr-2" />
      {newOrderLabel}
    </Button>
  );

  return (
    <div className="flex items-center justify-between gap-4 p-4 border-b bg-card">
      <div className="flex items-center gap-4 flex-1 min-w-0">
        <h1 className="text-xl font-bold truncate">{storeName}</h1>
        {!cashStateUnknown && (
          <Badge
            className={
              cashOpen
                ? 'bg-green-600 hover:bg-green-600 text-white font-bold border-transparent'
                : 'bg-destructive hover:bg-destructive text-destructive-foreground font-bold border-transparent'
            }
          >
            Caixa {cashOpen ? 'Aberto' : 'Fechado'}
          </Badge>
        )}
        {!cashStateUnknown && cashOpen && (
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Em caixa:</span>
            <span className="font-semibold tabular-nums">
              {showCashAmount ? formatPrice(cashAmount) : 'R$ ••••'}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onToggleCashAmount}>
              {showCashAmount ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </Button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {!cashStateUnknown && cashOpen && (
          <Button variant="outline" size="sm" onClick={onCloseCash}>
            <DoorClosed className="h-4 w-4 mr-2" />
            Fechar Caixa
          </Button>
        )}
        {cashStateUnknown ? null : cashOpen ? (
          newOrderBtn
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span tabIndex={0}>{newOrderBtn}</span>
              </TooltipTrigger>
              <TooltipContent>Abra o caixa para iniciar as vendas</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
    </div>
  );
}
