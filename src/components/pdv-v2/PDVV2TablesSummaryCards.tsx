import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, UtensilsCrossed, ClipboardList, CheckCircle2, DollarSign } from 'lucide-react';
import { brl as formatPrice } from './_format';

interface Props {
  occupiedTables: number;
  openTabs: number;
  closedToday: number;
  revenueToday: number;
  showRevenue: boolean;
  onToggleRevenue: () => void;
}

export function PDVV2TablesSummaryCards({
  occupiedTables,
  openTabs,
  closedToday,
  revenueToday,
  showRevenue,
  onToggleRevenue,
}: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 px-4 pt-0 pb-3">
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <UtensilsCrossed className="h-4 w-4" />
            Mesas Ocupadas
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">{occupiedTables}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <ClipboardList className="h-4 w-4" />
            Comandas em Aberto
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">{openTabs}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <CheckCircle2 className="h-4 w-4" />
            Comandas Finalizadas
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums">{closedToday}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
            <span className="flex items-center gap-2">
              <DollarSign className="h-4 w-4" />
              Faturamento Hoje
            </span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleRevenue}>
              {showRevenue ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            </Button>
          </div>
          <p className="text-2xl font-bold mt-1 tabular-nums text-primary">
            {showRevenue ? formatPrice(revenueToday) : '••••'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
