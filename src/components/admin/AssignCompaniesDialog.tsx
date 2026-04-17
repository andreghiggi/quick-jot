import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Search, Store } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resellerId: string | null;
  resellerName: string;
  onAssigned?: () => void;
}

interface AvailableCompany {
  id: string;
  name: string;
  slug: string;
  reseller_id: string | null;
}

export function AssignCompaniesDialog({ open, onOpenChange, resellerId, resellerName, onAssigned }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState<AvailableCompany[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!open) {
      setSelected(new Set());
      setSearch('');
      return;
    }
    (async () => {
      setLoading(true);
      // Only show companies WITHOUT a reseller (avoid stealing from another reseller)
      const { data, error } = await supabase
        .from('companies')
        .select('id, name, slug, reseller_id')
        .is('reseller_id', null)
        .eq('active', true)
        .order('name');
      if (error) {
        toast.error('Erro ao carregar lojas');
      } else {
        setCompanies(data || []);
      }
      setLoading(false);
    })();
  }, [open]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return companies;
    return companies.filter(c =>
      c.name.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q)
    );
  }, [companies, search]);

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAssign() {
    if (!resellerId || selected.size === 0) return;
    setSaving(true);
    const ids = Array.from(selected);
    let okCount = 0;
    let errCount = 0;

    for (const companyId of ids) {
      const company = companies.find(c => c.id === companyId);
      if (!company) continue;

      // 1. Update companies.reseller_id
      const { error: updErr } = await supabase
        .from('companies')
        .update({ reseller_id: resellerId })
        .eq('id', companyId);
      if (updErr) {
        console.error('assign company error:', updErr);
        errCount++;
        continue;
      }

      // 2. Insert reseller_companies link
      const { error: linkErr } = await supabase
        .from('reseller_companies')
        .insert({ reseller_id: resellerId, company_id: companyId });
      if (linkErr && linkErr.code !== '23505') {
        console.error('link reseller_companies error:', linkErr);
      }

      // 3. Trigger prorated billing for current month (no activation fee — store already exists)
      try {
        await supabase.functions.invoke('reseller-billing', {
          body: {
            action: 'create_prorated_item',
            reseller_id: resellerId,
            company_id: companyId,
            company_name: company.name,
            activation_fee: 0,
          },
        });
      } catch (billingErr) {
        console.error('billing prorated (non-blocking):', billingErr);
      }

      okCount++;
    }

    setSaving(false);
    if (okCount > 0) {
      toast.success(
        `${okCount} loja${okCount > 1 ? 's' : ''} vinculada${okCount > 1 ? 's' : ''} a ${resellerName}. Cobrança proporcional adicionada à fatura do mês.`
      );
    }
    if (errCount > 0) {
      toast.error(`${errCount} loja(s) falharam ao vincular`);
    }
    onAssigned?.();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Vincular lojas a {resellerName}</DialogTitle>
          <DialogDescription>
            Selecione as lojas existentes (sem revendedor atual) para vincular. A mensalidade
            proporcional aos dias restantes do mês será adicionada à fatura.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar loja por nome ou slug..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <ScrollArea className="h-[40vh] rounded-md border">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-32 text-sm text-muted-foreground gap-2">
              <Store className="w-6 h-6" />
              {companies.length === 0
                ? 'Não há lojas disponíveis para vincular'
                : 'Nenhuma loja encontrada'}
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map(c => (
                <label
                  key={c.id}
                  className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50 cursor-pointer"
                >
                  <Checkbox
                    checked={selected.has(c.id)}
                    onCheckedChange={() => toggle(c.id)}
                    disabled={saving}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{c.name}</div>
                    <div className="text-xs text-muted-foreground truncate">/{c.slug}</div>
                  </div>
                </label>
              ))}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center justify-between gap-3 pt-2">
          <span className="text-xs text-muted-foreground">
            {selected.size} loja{selected.size === 1 ? '' : 's'} selecionada{selected.size === 1 ? '' : 's'}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancelar
            </Button>
            <Button onClick={handleAssign} disabled={saving || selected.size === 0}>
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              Vincular {selected.size > 0 ? `(${selected.size})` : ''}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
