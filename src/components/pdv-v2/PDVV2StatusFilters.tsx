import { Button } from '@/components/ui/button';
import { OrderStatus } from '@/types/order';

export type StatusFilter = 'all' | OrderStatus;

interface PDVV2StatusFiltersProps {
  active: StatusFilter;
  onChange: (s: StatusFilter) => void;
  counts: Record<StatusFilter, number>;
}

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'Todos' },
  { key: 'pending', label: 'Pendentes' },
  { key: 'preparing', label: 'Preparando' },
  { key: 'ready', label: 'Prontos' },
  { key: 'delivered', label: 'Entregues' },
];

export function PDVV2StatusFilters({ active, onChange, counts }: PDVV2StatusFiltersProps) {
  return (
    <div className="flex gap-2 px-4 pb-2 flex-wrap">
      {FILTERS.map((f) => (
        <Button
          key={f.key}
          variant={active === f.key ? 'default' : 'outline'}
          size="sm"
          onClick={() => onChange(f.key)}
        >
          {f.label}
          <span className="ml-2 text-xs opacity-70">({counts[f.key] ?? 0})</span>
        </Button>
      ))}
    </div>
  );
}
