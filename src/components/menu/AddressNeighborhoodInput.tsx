import { Input } from '@/components/ui/input';
import { neighborhoodOptions } from '@/lib/addressFormRules';

export function AddressNeighborhoodInput({ value, onChange, names, className = '' }: { value: string; onChange: (value: string) => void; names: string[]; className?: string }) {
  if (!names.length) return <Input aria-label="Bairro" value={value} onChange={e => onChange(e.target.value)} placeholder="Nome do bairro" className={`text-base md:text-sm ${className}`} />;
  return <select aria-label="Bairro" value={value} onChange={e => onChange(e.target.value)} className={`flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base md:text-sm ${className}`}>
    <option value="">Escolha o bairro</option>
    {neighborhoodOptions(names, value).map(name => <option key={name} value={name}>{name}</option>)}
  </select>;
}