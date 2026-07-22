import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { SlidersHorizontal, Star, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import { moduleShortLabel } from '@/lib/moduleLabels';

export interface AdvancedFilters {
  createdFrom: string; // yyyy-mm-dd
  createdTo: string;
  dueDays: number[];
  states: string[];
  modulesAll: string[];
}

export const EMPTY_ADVANCED_FILTERS: AdvancedFilters = {
  createdFrom: '',
  createdTo: '',
  dueDays: [],
  states: [],
  modulesAll: [],
};

export function isAdvancedFiltersActive(f: AdvancedFilters): boolean {
  return !!(f.createdFrom || f.createdTo || f.dueDays.length || f.states.length || f.modulesAll.length);
}

export function countActiveFilters(f: AdvancedFilters): number {
  let n = 0;
  if (f.createdFrom || f.createdTo) n++;
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

interface Props {
  value: AdvancedFilters;
  onChange: (f: AdvancedFilters) => void;
  availableStates: string[];
  availableModules: string[];
}

export function ResellerLojasAdvancedFilters({ value, onChange, availableStates, availableModules }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AdvancedFilters>(value);
  const [presets, setPresets] = useState<SavedPreset[]>(() => loadPresets());
  const [newPresetName, setNewPresetName] = useState('');

  useEffect(() => { if (open) setDraft(value); }, [open, value]);

  const activeCount = countActiveFilters(value);

  const toggle = <K extends keyof AdvancedFilters>(key: K, item: any) => {
    setDraft(prev => {
      const arr = (prev[key] as any[]).slice();
      const idx = arr.indexOf(item);
      if (idx >= 0) arr.splice(idx, 1); else arr.push(item);
      return { ...prev, [key]: arr } as AdvancedFilters;
    });
  };

  const apply = () => { onChange(draft); setOpen(false); };
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
    setOpen(false);
    toast.success(`Filtro "${p.name}" aplicado`);
  };

  const deletePreset = (id: string) => {
    const list = presets.filter(p => p.id !== id);
    setPresets(list); savePresets(list);
  };

  const dayOptions = useMemo(() => Array.from({ length: 31 }, (_, i) => i + 1), []);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2 shrink-0 relative">
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filtros avançados</span>
          {activeCount > 0 && (
            <Badge className="rounded-full h-5 min-w-5 px-1.5 text-[10px]">{activeCount}</Badge>
          )}
        </Button>
      </SheetTrigger>
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
          {/* Data de cadastro */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Cadastro entre</Label>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="date"
                value={draft.createdFrom}
                onChange={e => setDraft(p => ({ ...p, createdFrom: e.target.value }))}
              />
              <Input
                type="date"
                value={draft.createdTo}
                onChange={e => setDraft(p => ({ ...p, createdTo: e.target.value }))}
              />
            </div>
          </div>

          {/* Dia de vencimento */}
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

          {/* UF */}
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

          {/* Módulos (todos precisam estar ativos) */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              Módulos habilitados {draft.modulesAll.length > 0 && `(${draft.modulesAll.length} — todos)`}
            </Label>
            <p className="text-[11px] text-muted-foreground -mt-1">A loja precisa ter TODOS os módulos selecionados ativos.</p>
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
          <Button variant="ghost" size="sm" onClick={clear} className="gap-1">
            <Trash2 className="w-4 h-4" />
            Limpar
          </Button>
          <Button size="sm" onClick={apply}>
            Aplicar filtros
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}