import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff } from 'lucide-react';
import { formatPrice } from '@/lib/utils';

interface PDVV2SummaryCardsProps {
  pending: number;
  preparing: number;
  ready: number;
  delivered: number;
  total: number;
  revenue: number;
  showRevenue: boolean;
  onToggleRevenue: () => void;
}

export function PDVV2SummaryCards({
  pending,
  preparing,
  ready,
  delivered,
  total,
  revenue,
  showRevenue,
  onToggleRevenue,
}: PDVV2SummaryCardsProps) {
  const items = [
    { label: 'Pendentes', value: pending, color: 'text-yellow-600' },
    { label: 'Preparando', value: preparing, color: 'text-blue-600' },
    { label: 'Prontos', value: ready, color: 'text-green-600' },
    { label: 'Entregues', value: delivered, color: 'text-muted-foreground' },
    { label: 'Total', value: total, color: 'text-foreground' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 p-4">
      {items.map((it) => (
        <Card key={it.label}>
          <CardContent className="p-3">
            <p className="text-xs text-muted-foreground">{it.label}</p>
            <p className={`text-2xl font-bold tabular-nums ${it.color}`}>{it.value}</p>
          </CardContent>
        </Card>
      ))}
      <Card>
        <CardContent className="p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Faturamento</p>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onToggleRevenue}>
              {showRevenue ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          </div>
          <p className="text-xl font-bold tabular-nums text-primary">
            {showRevenue ? formatPrice(revenue) : 'R$ ••••'}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
