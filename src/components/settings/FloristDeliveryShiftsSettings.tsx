// Turnos de entrega por dia da semana — exibido SOMENTE no perfil floricultura.
import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Plus, Trash2, Save, CalendarClock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  DAY_NAMES_SHORT,
  DEFAULT_FLORIST_SHIFTS,
  DeliveryShift,
  fetchDeliveryShifts,
  saveDayShifts,
  shiftLabel,
} from '@/lib/floristShifts';

interface Props {
  companyId?: string;
}

type DayMap = Record<number, DeliveryShift[]>;

const emptyDays = (): DayMap => ({ 0: [], 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] });

export function FloristDeliveryShiftsSettings({ companyId }: Props) {
  const { toast } = useToast();
  const [days, setDays] = useState<DayMap>(emptyDays());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    setLoading(true);
    fetchDeliveryShifts(companyId)
      .then((shifts) => {
        const map = emptyDays();
        for (const s of shifts) map[s.dayOfWeek] = [...(map[s.dayOfWeek] ?? []), s];
        setDays(map);
        setHasChanges(false);
      })
      .finally(() => setLoading(false));
  }, [companyId]);

  const patchDay = (day: number, shifts: DeliveryShift[]) => {
    setDays((prev) => ({ ...prev, [day]: shifts }));
    setHasChanges(true);
  };

  const toggleDay = (day: number, enabled: boolean) => {
    if (enabled) {
      patchDay(day, DEFAULT_FLORIST_SHIFTS.map((s, i) => ({ ...s, dayOfWeek: day, sortOrder: i })));
    } else {
      patchDay(day, []);
    }
  };

  const updateShift = (day: number, index: number, field: 'startTime' | 'endTime', value: string) => {
    const list = days[day].map((s, i) => {
      if (i !== index) return s;
      const next = { ...s, [field]: value };
      next.label = shiftLabel(next.startTime, next.endTime);
      return next;
    });
    patchDay(day, list);
  };

  const addShift = (day: number) => {
    const list = days[day];
    const last = list[list.length - 1];
    const start = last ? last.endTime : '08:00';
    const endHour = Math.min(Number(start.split(':')[0]) + 2, 23);
    const end = `${String(endHour).padStart(2, '0')}:00`;
    patchDay(day, [...list, { dayOfWeek: day, label: shiftLabel(start, end), startTime: start, endTime: end, sortOrder: list.length }]);
  };

  const removeShift = (day: number, index: number) => {
    patchDay(day, days[day].filter((_, i) => i !== index));
  };

  const handleSave = async () => {
    if (!companyId) return;
    for (const [day, list] of Object.entries(days)) {
      for (const s of list) {
        if (!s.startTime || !s.endTime || s.endTime <= s.startTime) {
          toast({ title: 'Turno inválido', description: `Revise os horários de ${DAY_NAMES_SHORT[Number(day)]}: o fim precisa ser depois do início.`, variant: 'destructive' });
          return;
        }
      }
    }
    setSaving(true);
    try {
      for (let day = 0; day <= 6; day++) {
        await saveDayShifts(companyId, day, days[day]);
      }
      setHasChanges(false);
      toast({ title: 'Turnos de entrega salvos', description: 'O catálogo já passa a oferecer os novos turnos.' });
    } catch {
      toast({ title: 'Erro ao salvar turnos', description: 'Tente novamente em instantes.', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="w-5 h-5" />
          Turnos de Entrega
        </CardTitle>
        <CardDescription>
          Defina os turnos de entrega de cada dia da semana. Dias desligados não oferecem entrega no catálogo.
          Se nenhum dia tiver turno cadastrado, o catálogo usa a grade padrão de 2 em 2 horas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {DAY_NAMES_SHORT.map((name, day) => {
          const shifts = days[day] ?? [];
          const enabled = shifts.length > 0;
          return (
            <div key={day} className="p-4 border rounded-lg space-y-3">
              <div className="flex items-center gap-3">
                <Switch checked={enabled} onCheckedChange={(checked) => toggleDay(day, checked)} />
                <span className={`text-sm font-medium min-w-[120px] ${!enabled ? 'text-muted-foreground' : ''}`}>{name}</span>
                {!enabled && <span className="text-sm text-muted-foreground">Sem entregas neste dia</span>}
              </div>
              {enabled && (
                <div className="pl-12 space-y-2">
                  {shifts.map((shift, index) => (
                    <div key={index} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-16">Turno {index + 1}:</span>
                      <Input
                        type="time"
                        value={shift.startTime}
                        onChange={(e) => updateShift(day, index, 'startTime', e.target.value)}
                        className="w-[110px]"
                      />
                      <span className="text-muted-foreground text-sm">até</span>
                      <Input
                        type="time"
                        value={shift.endTime}
                        onChange={(e) => updateShift(day, index, 'endTime', e.target.value)}
                        className="w-[110px]"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-destructive hover:text-destructive"
                        onClick={() => removeShift(day, index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => addShift(day)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Adicionar turno
                  </Button>
                </div>
              )}
            </div>
          );
        })}
        <Button onClick={handleSave} disabled={saving || !hasChanges} className="w-full">
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          Salvar Turnos de Entrega
        </Button>
      </CardContent>
    </Card>
  );
}
