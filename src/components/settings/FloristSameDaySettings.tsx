// Pedidos para o mesmo dia (retirada e entrega) — exibido SOMENTE no perfil floricultura.
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Timer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  LEAD_MINUTE_OPTIONS, PICKUP_MINUTE_OPTIONS, type FloristSameDayConfig,
  formatDuration, pickupNotice, spDate,
} from '@/lib/floristSameDay';
import { useFloristSameDay } from '@/hooks/useFloristSameDay';

const NO_SAME_DAY = 'none';

export function FloristSameDaySettings({ companyId }: { companyId?: string }) {
  const { toast } = useToast();
  const { config, now, loading, failed, saving, save: saveConfig, setDeliveryOpen } = useFloristSameDay(companyId);

  const save = async (patch: Partial<FloristSameDayConfig>, message: string) => {
    if (!companyId || saving) return;
    try {
      await saveConfig(patch);
      toast({ title: message });
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Tente novamente em instantes.', variant: 'destructive' });
    }
  };

  const closeToday = async (closed: boolean) => {
    if (!companyId || saving) return;
    try {
      await setDeliveryOpen(!closed);
      toast({ title: closed ? 'Entregas de hoje encerradas' : 'Entregas de hoje reabertas' });
    } catch {
      toast({ title: 'Erro ao salvar', description: 'Tente novamente em instantes.', variant: 'destructive' });
    }
  };

  if (loading || failed) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8 text-sm text-muted-foreground">
          {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : 'Não foi possível carregar as regras do mesmo dia. Recarregue a página.'}
        </CardContent>
      </Card>
    );
  }

  const closedToday = config.closedDate === spDate(now);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Timer className="w-5 h-5" />
          Pedidos para o Mesmo Dia
        </CardTitle>
        <CardDescription>
          Defina em quanto tempo o cliente pode retirar na loja e quais turnos ele pode escolher quando pede entrega para hoje.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 border rounded-lg space-y-2">
          <Label htmlFor="florist-pickup-time" className="font-medium">Tempo estimado para retirada</Label>
          <Select
            value={String(config.pickupMinutes)}
            disabled={saving}
            onValueChange={(v) => save({ pickupMinutes: Number(v) }, 'Prazo de retirada salvo')}
          >
            <SelectTrigger id="florist-pickup-time" className="w-full sm:w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PICKUP_MINUTE_OPTIONS.map((m) => <SelectItem key={m} value={String(m)}>{formatDuration(m)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">No catálogo: “{pickupNotice(config)}”</p>
        </div>

        <div className="p-4 border rounded-lg space-y-2">
          <Label htmlFor="florist-lead-time" className="font-medium">Antecedência mínima para entrega no mesmo dia</Label>
          <Select
            value={config.sameDayDelivery ? String(config.leadMinutes) : NO_SAME_DAY}
            disabled={saving}
            onValueChange={(v) => save(
              v === NO_SAME_DAY ? { sameDayDelivery: false } : { sameDayDelivery: true, leadMinutes: Number(v) },
              'Regra de entrega no mesmo dia salva',
            )}
          >
            <SelectTrigger id="florist-lead-time" className="w-full sm:w-[320px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LEAD_MINUTE_OPTIONS.map((m) => <SelectItem key={m} value={String(m)}>{formatDuration(m)} de antecedência</SelectItem>)}
              <SelectItem value={NO_SAME_DAY}>Não aceitar entregas no mesmo dia</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground">
            {config.sameDayDelivery
              ? `Exemplo: pedido feito às 16:00 pode escolher turnos que começam a partir das ${String(16 + config.leadMinutes / 60).padStart(2, '0')}:00.`
              : 'O cliente só consegue agendar entregas a partir de amanhã. A retirada na loja continua liberada.'}
          </p>
        </div>

        {config.sameDayDelivery && (
          <div className="flex items-center justify-between gap-4 p-4 border rounded-lg">
            <div className="min-w-0">
              <Label htmlFor="florist-close-today" className="font-medium">Encerrar entregas de hoje</Label>
              <p className="text-sm text-muted-foreground">
                {closedToday
                  ? 'Entregas para hoje encerradas. Voltam sozinhas amanhã.'
                  : 'Ligue quando não conseguir mais entregar hoje. Volta sozinho amanhã.'}
              </p>
            </div>
            <Switch
              id="florist-close-today"
              checked={closedToday}
              disabled={saving}
              onCheckedChange={(checked) => void closeToday(checked)}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
