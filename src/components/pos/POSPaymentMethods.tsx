import { Button } from '@/components/ui/button';
import { CreditCard, Smartphone, Banknote } from 'lucide-react';
import { PaymentMethod } from '@/types/pos';
import { cn } from '@/lib/utils';

interface POSPaymentMethodsProps {
  selected: PaymentMethod | null;
  onSelect: (method: PaymentMethod) => void;
  disabled?: boolean;
}

export function POSPaymentMethods({ selected, onSelect, disabled }: POSPaymentMethodsProps) {
  const methods: { value: PaymentMethod; label: string; icon: React.ReactNode; color: string }[] = [
    { 
      value: 'credit', 
      label: 'Crédito', 
      icon: <CreditCard className="h-8 w-8" />,
      color: 'bg-blue-500 hover:bg-blue-600' 
    },
    { 
      value: 'debit', 
      label: 'Débito', 
      icon: <Banknote className="h-8 w-8" />,
      color: 'bg-green-500 hover:bg-green-600' 
    },
    { 
      value: 'pix', 
      label: 'PIX', 
      icon: <Smartphone className="h-8 w-8" />,
      color: 'bg-teal-500 hover:bg-teal-600' 
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {methods.map(({ value, label, icon, color }) => (
        <Button
          key={value}
          variant="outline"
          className={cn(
            "h-24 flex-col gap-2 text-lg font-semibold transition-all",
            selected === value ? `${color} text-white border-transparent` : "bg-background"
          )}
          disabled={disabled}
          onClick={() => onSelect(value)}
        >
          {icon}
          {label}
        </Button>
      ))}
    </div>
  );
}
