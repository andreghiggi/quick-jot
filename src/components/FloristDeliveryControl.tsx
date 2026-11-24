import { Icon, Loader2, RefreshCw, type IconNode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFloristSameDay } from '@/hooks/useFloristSameDay';
import { acceptsDeliveryToday } from '@/lib/floristSameDay';
import { toast } from 'sonner';

const motorbike: IconNode = [
  ['circle', { cx: '5', cy: '17', r: '3', key: 'rear' }],
  ['circle', { cx: '19', cy: '17', r: '3', key: 'front' }],
  ['path', { d: 'M5 17h8l3-7 3 7M16 10l-2-5h3M7 10h5l4 3M5 10H3m4 0-2 7M7 10l2 4h5', key: 'frame' }],
];

export function FloristDeliveryControl({ companyId }: { companyId: string }) {
  const { config, now, loading, failed, saving, refetch, setDeliveryOpen } = useFloristSameDay(companyId);
  const open = acceptsDeliveryToday(config, now);
  const unavailable = !config.sameDayDelivery;
  const label = failed ? 'Consultar entregas de hoje' : open ? 'Encerrar entregas de hoje' : 'Reabrir entregas de hoje';
  const description = failed ? 'Não foi possível consultar as entregas. Clique para tentar novamente.'
    : loading ? 'Consultando entregas de hoje…'
    : unavailable ? 'Entregas no mesmo dia desativadas em Configurações → Horários.'
    : open ? 'Entregas de hoje liberadas. Clique para encerrar; a retirada continua disponível.'
    : 'Entregas de hoje encerradas; voltam sozinhas amanhã. Clique para reabrir.';

  async function toggle() {
    if (failed) { await refetch(); return; }
    if (loading || saving || unavailable) return;
    try {
      await setDeliveryOpen(!open);
      toast.success(open ? 'Entregas de hoje encerradas. Retirada mantida.' : 'Entregas de hoje reabertas.');
    } catch {
      toast.error('Não foi possível alterar as entregas de hoje. Tente novamente.');
    }
  }

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex shrink-0" tabIndex={loading || saving || (unavailable && !failed) ? 0 : undefined}>
            <Button type="button" variant="outline" size="icon"
              className={`h-7 w-7 shrink-0 ${loading || failed ? '' : open
                ? 'border-success/40 bg-success/10 text-success hover:bg-success/20 hover:text-success'
                : 'border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 hover:text-destructive'}`}
              disabled={loading || saving || (unavailable && !failed)}
              aria-label={label} aria-pressed={!loading && !failed && open} title={description}
              onClick={() => void toggle()}>
              {loading || saving ? <Loader2 className="animate-spin" /> : failed ? <RefreshCw /> : <Icon iconNode={motorbike} />}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">{description}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}