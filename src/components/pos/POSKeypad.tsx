import { Button } from '@/components/ui/button';
import { Delete } from 'lucide-react';

interface POSKeypadProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function POSKeypad({ value, onChange, disabled }: POSKeypadProps) {
  const handleDigit = (digit: string) => {
    if (disabled) return;
    
    // Limit to reasonable amount
    if (value.length >= 10) return;
    
    // Don't allow leading zeros
    if (value === '0' && digit === '0') return;
    if (value === '0' && digit !== '0') {
      onChange(digit);
      return;
    }
    
    onChange(value + digit);
  };

  const handleBackspace = () => {
    if (disabled) return;
    if (value.length <= 1) {
      onChange('0');
    } else {
      onChange(value.slice(0, -1));
    }
  };

  const handleClear = () => {
    if (disabled) return;
    onChange('0');
  };

  const buttons = [
    '1', '2', '3',
    '4', '5', '6',
    '7', '8', '9',
    'C', '0', 'DEL',
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {buttons.map((btn) => (
        <Button
          key={btn}
          variant={btn === 'C' ? 'destructive' : btn === 'DEL' ? 'outline' : 'secondary'}
          className="h-16 text-2xl font-bold"
          disabled={disabled}
          onClick={() => {
            if (btn === 'C') handleClear();
            else if (btn === 'DEL') handleBackspace();
            else handleDigit(btn);
          }}
        >
          {btn === 'DEL' ? <Delete className="h-6 w-6" /> : btn}
        </Button>
      ))}
    </div>
  );
}
