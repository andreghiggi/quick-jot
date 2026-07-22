import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Star, Trash2, Save, X, Search, CalendarIcon } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format, parse, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { moduleShortLabel } from '@/lib/moduleLabels';

export type StatusValue = 'active' | 'open' | 'overdue' | 'suspended' | 'blocked' | 'canceled' | 'inactive';
export type DateType = 'activated' | 'due' | 'monthly';
export type ContactType = 'phone' | 'email';
export type AddressType = 'city' | 'neighborhood';

export interface AdvancedFilters {
  dateType: DateType;
  dateFrom: string; // yyyy-mm-dd
  dateTo: string;
  contactType: ContactType;
  contactValue: string;
  addressType: AddressType;
  addressValue: string;
  plans: string[];
  statuses: StatusValue[];
  dueDays: number[];
  states: string[];
  modulesAll: string[];
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  dateType: 'activated',
  dateFrom: '',
  dateTo: '',
  contactType: 'phone',
  contactValue: '',
  addressType: 'city',
  addressValue: '',
  plans: [],
  statuses: [],
  dueDays: [],
  states: [],
  modulesAll: [],
};

export function isAdvancedFiltersActive(f: AdvancedFilters): boolean {
  return !!(
    f.dateFrom || f.dateTo ||
    f.contactValue.trim() || f.addressValue.trim() ||
    f.statuses.length ||
    f.dueDays.length || f.modulesAll.length
  );
}

export function countActiveFilters(f: AdvancedFilters): number {
  let n = 0;
  if (f.dateFrom || f.dateTo) n++;
  if (f.contactValue.trim()) n++;
  if (f.addressValue.trim()) n++;
  if (f.statuses.length) n++;
  if (f.dueDays.length) n++;
  if (f.modulesAll.length) n++;
  return n;
}

interface SavedPreset {
  id: string;
  name: string;
  filters: AdvancedFilters;
}

const STORAGE_KEY = 'reseller_lojas_saved_filters_v1';

function loadPresets(): SavedPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function savePresets(list: SavedPreset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}

export const STATUS_OPTIONS: { value: StatusValue; label: string }[] = [
  { value: 'active', label: 'Em dia' },
  { value: 'open', label: 'Fatura em aberto' },
  { value: 'overdue', label: 'Vencidas' },
  { value: 'suspended', label: 'Suspensas' },
  { value: 'blocked', label: 'Travadas' },
  { value: 'canceled', label: 'Canceladas' },
  { value: 'inactive', label: 'Inativas' },
];

interface Props {
  value: AdvancedFilters;
  onChange: (f: AdvancedFilters) => void;
  availableModules: string[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ResellerLojasAdvancedFilters({
  value, onChange, availableModules, open, onOpenChange,
}: Props) {
  const [draft, setDraft] = useState<AdvancedFilters>(value);
  const [presets, setPresets] = useState<SavedPreset[]>(() => loadPresets());
  const [newPresetName, setNewPresetName] = useState('');

  useEffect(() => { if (open) setDraft(value); }, [open, value]);

  const toggle = <K extends keyof AdvancedFilters>(key: K, item: any) => {
    setDraft(prev => {
      const arr = (prev[key] as any[]).slice();
      const idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(item);
      return { ...prev, [key]: arr } as AdvancedFilters;
    });
  };

  const apply = () => { onChange(draft); onOpenChange(false); };
  const clear = () => { setDraft(EMPTY_ADVANCED_FILTERS); };

  const savePreset = () => {
    const name = newPresetName.trim();
    if (!name) { toast.error('Dê um nome ao filtro'); return; }
    const next: SavedPreset = { id: crypto.randomUUID(), name, filters: draft };
    const list = [...presets, next];
    setPresets(list); savePresets(list); setNewPresetName('');
    toast.success(`Filtro "${name}" salvo`);
  };

  const applyPreset = (p: SavedPreset) => {
    setDraft(p.filters);
    onChange(p.filters);
    onOpenChange(false);
    toast.success(`Filtro "${p.name}" aplicado`);
  };

  const deletePreset = (id: string) => {
    const list = presets.filter(p => p.id !== id);
    setPresets(list); savePresets(list);
  };

  const parseDate = (s: string): Date | undefined => {
    if (!s) return undefined;
    const d = parse(s, 'yyyy-MM-dd', new Date());
    return isValid(d) ? d : undefined;
  };
  const fmtDate = (d?: Date) => (d ? format(d, 'yyyy-MM-dd') : '');
  const displayDate = (s: string) => {
    const d = parseDate(s);
    return d ? format(d, 'dd/MM/yyyy') : '';
  };

  if (!open) return null;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Filtros avançados</h3>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => onOpenChange(false)}>
          <X className="w-4 h-4" />
        </Button>
      </div>

        {presets.length > 0 && (
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Filtros salvos</Label>
            <div className="flex flex-wrap gap-1.5">
              {presets.map(p => (
                <div key={p.id} className="group flex items-center gap-1 rounded-full border pl-2 pr-1 py-0.5 bg-muted/50 hover:bg-muted">
                  <button
                    type="button"
                    className="text-xs flex items-center gap-1"
                    onClick={() => applyPreset(p)}
                  >
                    <Star className="w-3 h-3 text-amber-500" />
                    {p.name}
                  </button>
                  <button
                    type="button"
                    className="opacity-60 hover:opacity-100 hover:text-destructive p-0.5"
                    onClick={() => deletePreset(p.id)}
                    title="Remover"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <Separator className="my-2" />
          </div>
        )}

      {/* Linha 1: Tipo de data + Data início + Data fim */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Tipo de data</Label>
          <Select
            value={draft.dateType}
            onValueChange={(v: DateType) => setDraft(p => ({ ...p, dateType: v }))}
          >
            <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="activated">Data ativação</SelectItem>
              <SelectItem value="due">Data vencimento</SelectItem>
              <SelectItem value="monthly">Mensalidade</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Data Início</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('h-10 w-full justify-start text-left font-normal', !draft.dateFrom && 'text-muted-foreground')}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {draft.dateFrom ? displayDate(draft.dateFrom) : <span>Selecionar</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={parseDate(draft.dateFrom)}
                onSelect={(d) => setDraft(p => ({ ...p, dateFrom: fmtDate(d) }))}
                initialFocus
                locale={ptBR}
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Data Fim</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn('h-10 w-full justify-start text-left font-normal', !draft.dateTo && 'text-muted-foreground')}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {draft.dateTo ? displayDate(draft.dateTo) : <span>Selecionar</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={parseDate(draft.dateTo)}
                onSelect={(d) => setDraft(p => ({ ...p, dateTo: fmtDate(d) }))}
                initialFocus
                locale={ptBR}
                className={cn('p-3 pointer-events-auto')}
              />
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Linha 2: Contato + Endereço */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Contato por</Label>
          <div className="grid grid-cols-[9rem_1fr] gap-2">
            <Select
              value={draft.contactType}
              onValueChange={(v: ContactType) => setDraft(p => ({ ...p, contactType: v }))}
            >
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="phone">Telefone</SelectItem>
                <SelectItem value="email">E-mail</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-10"
              placeholder={draft.contactType === 'phone' ? 'Digite parte do telefone' : 'Digite parte do e-mail'}
              value={draft.contactValue}
              onChange={e => setDraft(p => ({ ...p, contactValue: e.target.value }))}
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Endereço</Label>
          <div className="grid grid-cols-[9rem_1fr] gap-2">
            <Select
              value={draft.addressType}
              onValueChange={(v: AddressType) => setDraft(p => ({ ...p, addressType: v }))}
            >
              <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="city">Cidade</SelectItem>
                <SelectItem value="neighborhood">Bairro</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="h-10"
              placeholder={draft.addressType === 'city' ? 'Digite a cidade' : 'Digite o bairro'}
              value={draft.addressValue}
              onChange={e => setDraft(p => ({ ...p, addressValue: e.target.value }))}
            />
          </div>
        </div>
      </div>

      {/* Adicionais */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Adicionais {draft.modulesAll.length > 0 && `(${draft.modulesAll.length} — todos)`}
        </Label>
        <p className="text-[11px] text-muted-foreground -mt-1">A loja precisa ter TODOS os adicionais selecionados ativos.</p>
        {availableModules.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">Nenhum módulo ativo em nenhuma loja</p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {availableModules.map(m => {
              const active = draft.modulesAll.includes(m);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggle('modulesAll', m)}
                  className={`h-7 px-2 rounded-full text-xs border transition ${active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                >
                  {moduleShortLabel(m)}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Status */}
      <div className="space-y-2">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">
          Status {draft.statuses.length > 0 && `(${draft.statuses.length})`}
        </Label>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map(s => {
            const active = draft.statuses.includes(s.value);
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => toggle('statuses', s.value)}
                className={`h-7 px-2 rounded-full text-xs border transition ${active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex justify-between gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={clear} className="gap-1 uppercase">
          <Trash2 className="w-4 h-4" />
          Limpar
        </Button>
        <Button size="sm" onClick={apply} className="gap-1 uppercase">
          <Search className="w-4 h-4" />
          Aplicar filtros
        </Button>
      </div>
    </div>
  );
}
