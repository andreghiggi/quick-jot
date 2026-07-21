import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyInvoiceSummary {
  id: string;
  status: string;
  due_date: string;
  total_value: number;
  month: string;
  is_overdue: boolean;
  days_overdue: number;
}

export interface CompanyEnrichment {
  modules: string[]; // enabled module names
  nextOpenInvoice: CompanyInvoiceSummary | null;
  hasOverdue: boolean;
}

/**
 * Carrega, em lote, para uma lista de company_ids:
 * - módulos habilitados (`company_modules.enabled = true`)
 * - a próxima fatura em aberto (`reseller_invoices` status != paid/canceled), a mais antiga
 * Retorna um Map<company_id, CompanyEnrichment>.
 */
export function useResellerCompanyEnrichment(companyIds: string[]) {
  const [data, setData] = useState<Map<string, CompanyEnrichment>>(new Map());
  const [loading, setLoading] = useState(false);

  const key = [...companyIds].sort().join(',');

  useEffect(() => {
    if (companyIds.length === 0) {
      setData(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);

    (async () => {
      const [mods, invs] = await Promise.all([
        supabase
          .from('company_modules')
          .select('company_id, module_name, enabled')
          .in('company_id', companyIds)
          .eq('enabled', true),
        supabase
          .from('reseller_invoices')
          .select('id, company_id, status, due_date, total_value, month')
          .in('company_id', companyIds)
          .not('status', 'in', '(paid,canceled)')
          .order('due_date', { ascending: true }),
      ]);

      if (cancelled) return;

      const map = new Map<string, CompanyEnrichment>();
      for (const id of companyIds) {
        map.set(id, { modules: [], nextOpenInvoice: null, hasOverdue: false });
      }

      (mods.data || []).forEach((m: any) => {
        const entry = map.get(m.company_id);
        if (entry) entry.modules.push(m.module_name);
      });

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      (invs.data || []).forEach((inv: any) => {
        const entry = map.get(inv.company_id);
        if (!entry) return;
        const due = new Date(inv.due_date);
        due.setHours(0, 0, 0, 0);
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
        const isOverdue = daysOverdue > 0;
        if (isOverdue) entry.hasOverdue = true;
        // primeira fatura (mais antiga em aberto) vira a "próxima"
        if (!entry.nextOpenInvoice) {
          entry.nextOpenInvoice = {
            id: inv.id,
            status: inv.status,
            due_date: inv.due_date,
            total_value: Number(inv.total_value) || 0,
            month: inv.month,
            is_overdue: isOverdue,
            days_overdue: Math.max(0, daysOverdue),
          };
        }
      });

      setData(map);
      setLoading(false);
    })();

    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data, loading };
}