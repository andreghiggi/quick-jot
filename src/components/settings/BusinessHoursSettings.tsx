import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Loader2, Clock, Save } from 'lucide-react';
import { useBusinessHours, BusinessHoursConfig, BusinessHour } from '@/hooks/useBusinessHours';

interface BusinessHoursSettingsProps {
  companyId?: string;
}

export function BusinessHoursSettings({ companyId }: BusinessHoursSettingsProps) {
  const { config, loading, saving, saveBusinessHours, DAY_NAMES } = useBusinessHours({ companyId });
  
  const [localConfig, setLocalConfig] = useState<BusinessHoursConfig>({
    alwaysOpen: true,
    hours: [],
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
    
    // If switching to custom and no hours, create defaults
    let hours = localConfig.hours;
    if (!alwaysOpen && hours.length === 0) {
      hours = DAY_NAMES.map((_, index) => ({
        companyId: companyId!,
        dayOfWeek: index,
        isOpen: index !== 0, // Sunday closed by default
        openTime: '08:00',
        closeTime: '22:00',
      }));
    }
    
    setLocalConfig({ alwaysOpen, hours });
    setHasChanges(true);
  };

  const handleDayToggle = (dayOfWeek: number, isOpen: boolean) => {
    const newHours = localConfig.hours.map((hour) =>
      hour.dayOfWeek === dayOfWeek ? { ...hour, isOpen } : hour
    );
    setLocalConfig({ ...localConfig, hours: newHours });
    setHasChanges(true);
  };

  const handleTimeChange = (dayOfWeek: number, field: 'openTime' | 'closeTime', value: string) => {
    const newHours = localConfig.hours.map((hour) =>
      hour.dayOfWeek === dayOfWeek ? { ...hour, [field]: value } : hour
    );
    setLocalConfig({ ...localConfig, hours: newHours });
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
  const hoursToDisplay = DAY_NAMES.map((_, index) => {
    const existing = localConfig.hours.find((h) => h.dayOfWeek === index);
    return existing || {
      companyId: companyId!,
      dayOfWeek: index,
      isOpen: index !== 0,
      openTime: '08:00',
      closeTime: '22:00',
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
                Defina os dias e horários de funcionamento
              </p>
            </div>
          </div>
        </RadioGroup>

        {/* Custom Hours Configuration */}
        {!localConfig.alwaysOpen && (
          <div className="space-y-3 pt-4 border-t">
            <Label className="text-base font-medium">Configurar Horários</Label>
            <div className="space-y-2">
              {hoursToDisplay.map((hour) => (
                <div
                  key={hour.dayOfWeek}
                  className="flex items-center gap-4 p-3 border rounded-lg"
                >
                  <div className="flex items-center gap-3 min-w-[160px]">
                    <Switch
                      checked={hour.isOpen}
                      onCheckedChange={(checked) => handleDayToggle(hour.dayOfWeek, checked)}
                    />
                    <span className={`text-sm font-medium ${!hour.isOpen ? 'text-muted-foreground' : ''}`}>
                      {DAY_NAMES[hour.dayOfWeek]}
                    </span>
                  </div>
                  
                  {hour.isOpen ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        type="time"
                        value={hour.openTime || '08:00'}
                        onChange={(e) => handleTimeChange(hour.dayOfWeek, 'openTime', e.target.value)}
                        className="w-[120px]"
                      />
                      <span className="text-muted-foreground">até</span>
                      <Input
                        type="time"
                        value={hour.closeTime || '22:00'}
                        onChange={(e) => handleTimeChange(hour.dayOfWeek, 'closeTime', e.target.value)}
                        className="w-[120px]"
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">Fechado</span>
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
