import { useEffect, useMemo, useState, ReactNode } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Star, Trash2, Save, X, Search, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { moduleShortLabel } from '@/lib/moduleLabels';

export type StatusValue = 'active' | 'open' | 'overdue' | 'suspended' | 'blocked' | 'canceled' | 'inactive';
export type DateType = 'created' | 'activated' | 'due';
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
  dateType: 'created',
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
    f.plans.length || f.statuses.length ||
    f.dueDays.length || f.states.length || f.modulesAll.length
  );
}

export function countActiveFilters(f: AdvancedFilters): number {
  let n = 0;
  if (f.dateFrom || f.dateTo) n++;
  if (f.contactValue.trim()) n++;
  if (f.addressValue.trim()) n++;
  if (f.plans.length) n++;
  if (f.statuses.length) n++;
  if (f.dueDays.length) n++;
  if (f.states.length) n++;
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
  availableStates: string[];
  availableModules: string[];
  availablePlans: string[];
  trigger: ReactNode;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function ResellerLojasAdvancedFilters({
  value, onChange, availableStates, availableModules, availablePlans, trigger, open, onOpenChange,
}: Props) {
  const [draft, setDraft] = useState<AdvancedFilters>(value);
  const [presets, setPresets] = useState<SavedPreset[]>(() => loadPresets());
  const [newPresetName, setNewPresetName] = useState('');
  const [showMore, setShowMore] = useState(false);

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

  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {trigger}
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Filtros avançados</SheetTitle>
        </SheetHeader>

        {presets.length > 0 && (
          <div className="mt-4 space-y-2">
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
            <Separator className="my-3" />
          </div>
        )}

        <div className="space-y-5 py-2">
          {/* Bloco A — Data */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Data</Label>
            <Select
              value={draft.dateType}
              onValueChange={(v: DateType) => setDraft(p => ({ ...p, dateType: v }))}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="created">Data de cadastro</SelectItem>
                <SelectItem value="activated">Data de ativação</SelectItem>
                <SelectItem value="due">Data de vencimento</SelectItem>
              </SelectContent>
            </Select>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Início</Label>
                <Input
                  type="date"
                  value={draft.dateFrom}
                  onChange={e => setDraft(p => ({ ...p, dateFrom: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-[11px] text-muted-foreground">Fim</Label>
                <Input
                  type="date"
                  value={draft.dateTo}
                  onChange={e => setDraft(p => ({ ...p, dateTo: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Bloco B — Contato */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Contato</Label>
            <div className="grid grid-cols-[9rem_1fr] gap-2">
              <Select
                value={draft.contactType}
                onValueChange={(v: ContactType) => setDraft(p => ({ ...p, contactType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="phone">Telefone</SelectItem>
                  <SelectItem value="email">E-mail</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={draft.contactType === 'phone' ? 'Digite parte do telefone' : 'Digite parte do e-mail'}
                value={draft.contactValue}
                onChange={e => setDraft(p => ({ ...p, contactValue: e.target.value }))}
              />
            </div>
          </div>

          {/* Bloco C — Endereço */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Endereço</Label>
            <div className="grid grid-cols-[9rem_1fr] gap-2">
              <Select
                value={draft.addressType}
                onValueChange={(v: AddressType) => setDraft(p => ({ ...p, addressType: v }))}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="city">Cidade</SelectItem>
                  <SelectItem value="neighborhood">Bairro</SelectItem>
                </SelectContent>
              </Select>
              <Input
                placeholder={draft.addressType === 'city' ? 'Digite a cidade' : 'Digite o bairro'}
                value={draft.addressValue}
                onChange={e => setDraft(p => ({ ...p, addressValue: e.target.value }))}
              />
            </div>
          </div>

          {/* Bloco D — Categorização */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Produtos {draft.plans.length > 0 && `(${draft.plans.length})`}
            </Label>
            {availablePlans.length === 0 ? (
              <p className="text-xs text-muted-foreground italic">Nenhum plano encontrado</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {availablePlans.map(pl => {
                  const active = draft.plans.includes(pl);
                  return (
                    <button
                      key={pl}
                      type="button"
                      onClick={() => toggle('plans', pl)}
                      className={`h-7 px-2 rounded-full text-xs border transition ${active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                    >
                      {pl}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

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

          {/* Bloco E — Mais filtros */}
          <button
            type="button"
            onClick={() => setShowMore(v => !v)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {showMore ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            Mais filtros
          </button>

          {showMore && (
            <>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  Dia de vencimento {draft.dueDays.length > 0 && `(${draft.dueDays.length})`}
                </Label>
                <div className="flex flex-wrap gap-1">
                  {dayOptions.map(d => {
                    const active = draft.dueDays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggle('dueDays', d)}
                        className={`h-7 w-7 rounded text-xs border transition ${active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                  UF {draft.states.length > 0 && `(${draft.states.length})`}
                </Label>
                {availableStates.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">Nenhuma UF cadastrada</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {availableStates.map(uf => {
                      const active = draft.states.includes(uf);
                      return (
                        <button
                          key={uf}
                          type="button"
                          onClick={() => toggle('states', uf)}
                          className={`h-7 px-2 rounded-full text-xs border transition ${active ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-muted'}`}
                        >
                          {uf}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          <Separator />

          {/* Salvar como favorito */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Salvar como favorito</Label>
            <div className="flex gap-2">
              <Input
                placeholder='Ex: "Inadimplentes SP"'
                value={newPresetName}
                onChange={e => setNewPresetName(e.target.value)}
                disabled={!isAdvancedFiltersActive(draft)}
              />
              <Button
                variant="outline"
                size="sm"
                className="gap-1 shrink-0"
                onClick={savePreset}
                disabled={!isAdvancedFiltersActive(draft) || !newPresetName.trim()}
              >
                <Save className="w-4 h-4" />
                Salvar
              </Button>
            </div>
          </div>
        </div>

        <SheetFooter className="mt-4 flex-row justify-between gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={clear} className="gap-1 uppercase">
            <Trash2 className="w-4 h-4" />
            Limpar
          </Button>
          <Button size="sm" onClick={apply} className="gap-1 uppercase">
            <Search className="w-4 h-4" />
            Aplicar filtros
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
