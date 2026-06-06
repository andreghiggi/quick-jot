/**
 * Lookup de CEST a partir do NCM informado.
 *
 * A tabela (~178KB) é carregada sob demanda via dynamic import — não pesa
 * no bundle inicial. Baseada no Convênio ICMS 142/2018 (CONFAZ).
 *
 * Um NCM pode mapear para múltiplos CESTs. Quando isso acontece, retornamos
 * todos para o front decidir (UI mostra Select).
 *
 * Também tentamos prefixos: se '38151210' não tem entrada, tentamos '381512',
 * '3815', '38' — o Convênio frequentemente lista por prefixo.
 */
export interface CestMatch {
  cest: string;
  desc: string;
}

let cache: Record<string, CestMatch[]> | null = null;

async function load(): Promise<Record<string, CestMatch[]>> {
  if (cache) return cache;
  const mod = await import('@/data/cestNcm.json');
  cache = (mod.default ?? mod) as Record<string, CestMatch[]>;
  return cache;
}

export async function lookupCestByNcm(ncmRaw: string): Promise<CestMatch[]> {
  const ncm = (ncmRaw || '').replace(/\D/g, '');
  if (ncm.length < 2) return [];
  const table = await load();

  // Tenta o NCM completo e prefixos progressivamente menores (8→2).
  const tried = new Set<string>();
  const result: CestMatch[] = [];
  for (let len = ncm.length; len >= 2; len--) {
    const key = ncm.substring(0, len);
    if (tried.has(key)) continue;
    tried.add(key);
    const hits = table[key];
    if (hits && hits.length) {
      for (const h of hits) {
        if (!result.find((r) => r.cest === h.cest)) result.push(h);
      }
      // se achou no nível mais específico, pode parar
      if (result.length) break;
    }
  }
  return result;
}