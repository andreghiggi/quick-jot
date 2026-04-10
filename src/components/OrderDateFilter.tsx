import { format, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { CalendarIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

type QuickPeriod = 'today' | '7d' | '15d' | '30d' | 'all';

interface OrderDateFilterProps {
  startDate: Date | undefined;
  endDate: Date | undefined;
  onStartDateChange: (date: Date | undefined) => void;
  onEndDateChange: (date: Date | undefined) => void;
  onClear: () => void;
  activePeriod?: QuickPeriod;
  onPeriodChange?: (period: QuickPeriod) => void;
}

const quickPeriods: { value: QuickPeriod; label: string }[] = [
  { value: 'today', label: 'Hoje' },
  { value: '7d', label: 'Últimos 7 dias' },
  { value: '15d', label: 'Últimos 15 dias' },
  { value: '30d', label: 'Últimos 30 dias' },
  { value: 'all', label: 'Tempo todo' },
];

export function OrderDateFilter({ startDate, endDate, onStartDateChange, onEndDateChange, onClear, activePeriod = 'today', onPeriodChange }: OrderDateFilterProps) {
  const handlePeriodClick = (period: QuickPeriod) => {
    onPeriodChange?.(period);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    switch (period) {
      case 'today':
        onClear();
        break;
      case '7d':
        onStartDateChange(subDays(today, 7));
        onEndDateChange(new Date());
        break;
      case '15d':
        onStartDateChange(subDays(today, 15));
        onEndDateChange(new Date());
        break;
      case '30d':
        onStartDateChange(subDays(today, 30));
        onEndDateChange(new Date());
        break;
      case 'all':
        onStartDateChange(new Date(2020, 0, 1));
        onEndDateChange(new Date());
        break;
    }
  };

  const handleManualDateChange = (setter: (d: Date | undefined) => void) => (date: Date | undefined) => {
    onPeriodChange?.(undefined as any);
    setter(date);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Quick period pills */}
      <div className="flex flex-wrap items-center gap-2">
        {quickPeriods.map((p) => (
          <Button
            key={p.value}
            variant={activePeriod === p.value ? 'default' : 'outline'}
            size="sm"
            className="h-8 rounded-full text-xs"
            onClick={() => handlePeriodClick(p.value)}
          >
            {p.label}
          </Button>
        ))}
      </div>

      {/* Date pickers */}
      <div className="flex flex-wrap items-center gap-2">
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "justify-start text-left font-normal h-9",
                !startDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {startDate ? format(startDate, "dd/MM/yyyy", { locale: ptBR }) : "Data início"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={startDate}
              onSelect={handleManualDateChange(onStartDateChange)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn(
                "justify-start text-left font-normal h-9",
                !endDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : "Data fim"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={endDate}
              onSelect={handleManualDateChange(onEndDateChange)}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>

        {(startDate || endDate) && (
          <Button variant="ghost" size="sm" onClick={() => { onClear(); onPeriodChange?.('today'); }} className="h-9">
            Limpar
          </Button>
        )}
      </div>
    </div>
  );
}
