import { supabase } from '@/integrations/supabase/client';

/**
 * Cache compartilhado dos módulos da empresa.
 * Antes, menu, tema e cada verificação de módulo (PDV V2, Mercado, Financeiro,
 * Cardápio...) faziam sua própria consulta à mesma tabela a cada tela aberta.
 * Agora uma única consulta por empresa é reaproveitada por todos (com
 * deduplicação de chamadas simultâneas e validade curta).
 */
export interface CompanyModuleRow {
  id: string;
  company_id: string;
  module_name: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

const TTL_MS = 30_000;
const cache = new Map<string, { at: number; rows: CompanyModuleRow[] }>();
const inflight = new Map<string, Promise<CompanyModuleRow[]>>();

export function getCompanyModules(companyId: string, force = false): Promise<CompanyModuleRow[]> {
  const hit = cache.get(companyId);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return Promise.resolve(hit.rows);
  const pending = inflight.get(companyId);
  if (pending && !force) return pending;

  const p = (async () => {
    try {
      const { data, error } = await supabase
        .from('company_modules')
        .select('*')
        .eq('company_id', companyId);
      if (error) throw error;
      const rows = (data || []) as CompanyModuleRow[];
      cache.set(companyId, { at: Date.now(), rows });
      return rows;
    } finally {
      inflight.delete(companyId);
    }
  })();
  inflight.set(companyId, p);
  return p;
}

/** Mesmo formato do antigo `.maybeSingle()`: `{ data: { enabled } | null }`. */
export async function getCompanyModuleRow(
  companyId: string,
  moduleName: string,
): Promise<{ data: { enabled: boolean } | null }> {
  try {
    const rows = await getCompanyModules(companyId);
    const row = rows.find((r) => r.module_name === moduleName);
    return { data: row ? { enabled: row.enabled } : null };
  } catch {
    return { data: null };
  }
}

export function invalidateCompanyModules(companyId?: string) {
  if (companyId) cache.delete(companyId);
  else cache.clear();
}
