import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Clock, Save, Plus, Trash2 } from 'lucide-react';
import { useBusinessHours, BusinessHoursConfig, DayConfig } from '@/hooks/useBusinessHours';

interface BusinessHoursSettingsProps {
  companyId?: string;
}

export function BusinessHoursSettings({ companyId }: BusinessHoursSettingsProps) {
  const { config, loading, saving, saveBusinessHours, DAY_NAMES, DEFAULT_DAYS } = useBusinessHours({ companyId });
  
  const [localConfig, setLocalConfig] = useState<BusinessHoursConfig>({
    alwaysOpen: true,
    days: [],
  });
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (!loading) {
      setLocalConfig(config);
      setHasChanges(false);
    }
  }, [config, loading]);

  const handleModeChange = (mode: 'always' | 'custom') => {
    const alwaysOpen = mode === 'always';
    
    // If switching to custom and no days, create defaults
    let days = localConfig.days;
    if (!alwaysOpen && days.length === 0) {
      days = DEFAULT_DAYS;
    }
    
    setLocalConfig({ alwaysOpen, days });
    setHasChanges(true);
  };

  const handleDayToggle = (dayOfWeek: number, isOpen: boolean) => {
    const newDays = localConfig.days.map((day) =>
      day.dayOfWeek === dayOfWeek ? { ...day, isOpen } : day
    );
    setLocalConfig({ ...localConfig, days: newDays });
    setHasChanges(true);
  };

  const handleTimeChange = (dayOfWeek: number, periodIndex: number, field: 'openTime' | 'closeTime', value: string) => {
    const newDays = localConfig.days.map((day) => {
      if (day.dayOfWeek !== dayOfWeek) return day;
      const newPeriods = day.periods.map((period, idx) =>
        idx === periodIndex ? { ...period, [field]: value } : period
      );
      return { ...day, periods: newPeriods };
    });
    setLocalConfig({ ...localConfig, days: newDays });
    setHasChanges(true);
  };

  const addPeriod = (dayOfWeek: number) => {
    const newDays = localConfig.days.map((day) => {
      if (day.dayOfWeek !== dayOfWeek) return day;
      if (day.periods.length >= 3) return day; // Max 3 periods
      return {
        ...day,
        periods: [...day.periods, { openTime: '18:00', closeTime: '23:00' }],
      };
    });
    setLocalConfig({ ...localConfig, days: newDays });
    setHasChanges(true);
  };

  const removePeriod = (dayOfWeek: number, periodIndex: number) => {
    const newDays = localConfig.days.map((day) => {
      if (day.dayOfWeek !== dayOfWeek) return day;
      if (day.periods.length <= 1) return day; // Keep at least one period
      return {
        ...day,
        periods: day.periods.filter((_, idx) => idx !== periodIndex),
      };
    });
    setLocalConfig({ ...localConfig, days: newDays });
    setHasChanges(true);
  };

  const handleSave = async () => {
    await saveBusinessHours(localConfig);
    setHasChanges(false);
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

  // Ensure we have 7 days
  const daysToDisplay: DayConfig[] = DAY_NAMES.map((_, index) => {
    const existing = localConfig.days.find((d) => d.dayOfWeek === index);
    return existing || {
      dayOfWeek: index,
      isOpen: index !== 0,
      periods: [{ openTime: '08:00', closeTime: '22:00' }],
    };
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          Horários de Atendimento
        </CardTitle>
        <CardDescription>
          Configure os dias e horários de funcionamento do seu estabelecimento
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Mode Selection */}
        <RadioGroup
          value={localConfig.alwaysOpen ? 'always' : 'custom'}
          onValueChange={(value) => handleModeChange(value as 'always' | 'custom')}
          className="space-y-3"
        >
          <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="always" id="always-open" />
            <div className="flex-1">
              <Label htmlFor="always-open" className="font-medium cursor-pointer">
                Sempre Aberto
              </Label>
              <p className="text-sm text-muted-foreground">
                O estabelecimento está disponível 24 horas, todos os dias
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-muted/50 cursor-pointer">
            <RadioGroupItem value="custom" id="custom-hours" />
            <div className="flex-1">
              <Label htmlFor="custom-hours" className="font-medium cursor-pointer">
                Horário Personalizado
              </Label>
              <p className="text-sm text-muted-foreground">
                Defina os dias e horários de funcionamento (suporta múltiplos turnos)
              </p>
            </div>
          </div>
        </RadioGroup>

        {/* Custom Hours Configuration */}
        {!localConfig.alwaysOpen && (
          <div className="space-y-3 pt-4 border-t">
            <Label className="text-base font-medium">Configurar Horários</Label>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione múltiplos turnos clicando em "+" (ex: almoço e jantar)
            </p>
            <div className="space-y-4">
              {daysToDisplay.map((day) => (
                <div
                  key={day.dayOfWeek}
                  className="p-4 border rounded-lg space-y-3"
                >
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={day.isOpen}
                      onCheckedChange={(checked) => handleDayToggle(day.dayOfWeek, checked)}
                    />
                    <span className={`text-sm font-medium min-w-[120px] ${!day.isOpen ? 'text-muted-foreground' : ''}`}>
                      {DAY_NAMES[day.dayOfWeek]}
                    </span>
                    {!day.isOpen && (
                      <span className="text-sm text-muted-foreground">Fechado</span>
                    )}
                  </div>
                  
                  {day.isOpen && (
                    <div className="pl-12 space-y-2">
                      {day.periods.map((period, periodIndex) => (
                        <div key={periodIndex} className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-16">
                            Turno {periodIndex + 1}:
                          </span>
                          <Input
                            type="time"
                            value={period.openTime}
                            onChange={(e) => handleTimeChange(day.dayOfWeek, periodIndex, 'openTime', e.target.value)}
                            className="w-[110px]"
                          />
                          <span className="text-muted-foreground text-sm">até</span>
                          <Input
                            type="time"
                            value={period.closeTime}
                            onChange={(e) => handleTimeChange(day.dayOfWeek, periodIndex, 'closeTime', e.target.value)}
                            className="w-[110px]"
                          />
                          {day.periods.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => removePeriod(day.dayOfWeek, periodIndex)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                      {day.periods.length < 3 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="mt-2"
                          onClick={() => addPeriod(day.dayOfWeek)}
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Adicionar turno
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="w-full"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-2" />
          )}
          Salvar Horários
        </Button>
      </CardContent>
    </Card>
  );
}
