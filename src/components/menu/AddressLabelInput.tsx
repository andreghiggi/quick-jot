import { Home, BriefcaseBusiness } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { addressLabelDisabled, toggleAddressLabel } from '@/lib/addressFormRules';

export function AddressLabelInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return <div className="space-y-2">
    <Label>Apelido do endereço (opcional)</Label>
    <div className="flex gap-2">
      {([{ name: 'Casa', Icon: Home }, { name: 'Trabalho', Icon: BriefcaseBusiness }]).map(({ name, Icon }) =>
        <Button key={name} type="button" variant={value === name ? 'default' : 'outline'} aria-pressed={value === name} disabled={addressLabelDisabled(value, name)} onClick={() => onChange(toggleAddressLabel(value, name))} className="gap-2"><Icon className="h-4 w-4" />{name}</Button>)}
    </div>
    <Input aria-label="Apelido do endereço" value={value} maxLength={100} className="text-base md:text-sm" placeholder="Apelido personalizado" onChange={e => onChange(e.target.value)} />
  </div>;
}