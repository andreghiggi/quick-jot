import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface Props {
  origin?: 'cardapio' | 'balcao' | 'mesa' | string;
}

/**
 * Badge de origem do pedido exibido no topo de cada OrderCard no PDV V2.
 * Não altera o OrderCard original (compartilhado com a Dashboard V1).
 */
export function PDVV2OrderOriginBadge({ origin }: Props) {
  if (!origin) return null;

  const map: Record<string, { label: string; className: string }> = {
    cardapio: {
      label: '🌐 Cardápio',
      className: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-900/30 dark:text-sky-200 dark:border-sky-700',
    },
    balcao: {
      label: '⚡ Express',
      className: 'bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-900/30 dark:text-purple-200 dark:border-purple-700',
    },
    mesa: {
      label: '🍽 Mesa',
      className: 'bg-orange-100 text-orange-800 border-orange-300 dark:bg-orange-900/30 dark:text-orange-200 dark:border-orange-700',
    },
  };

  const cfg = map[origin] ?? {
    label: origin,
    className: 'bg-muted text-muted-foreground border-border',
  };

  return (
    <Badge className={cn('text-xs border font-semibold', cfg.className)}>
      {cfg.label}
    </Badge>
  );
}
