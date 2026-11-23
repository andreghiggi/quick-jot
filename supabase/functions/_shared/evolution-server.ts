// Escolhe a qual servidor Evolution cada empresa pertence.
//
// Padrão (qualquer empresa sem registro): a Evolution atual, configurada em
// EVOLUTION_API_URL / EVOLUTION_API_KEY. Só as empresas listadas em
// whatsapp_evolution_routing com server = 'v24' usam a Evolution 2.4
// (EVOLUTION24_API_URL / EVOLUTION24_API_KEY). Sem registro = comportamento de sempre.
//
// Se uma empresa está marcada como v24 mas as variáveis da 2.4 não existem, a função
// devolve null: quem chama deve falhar, nunca cair para a Evolution atual (a instância
// não existe lá e uma chamada de criação/QR criaria uma sessão no servidor errado).

export type EvoServerId = 'v23' | 'v24';
export type EvoServer = { id: EvoServerId; url: string; key: string };

export function defaultEvoServer(): EvoServer | null {
  const url = Deno.env.get('EVOLUTION_API_URL');
  const key = Deno.env.get('EVOLUTION_API_KEY');
  return url && key ? { id: 'v23', url, key } : null;
}

export function v24EvoServer(): EvoServer | null {
  const url = Deno.env.get('EVOLUTION24_API_URL');
  const key = Deno.env.get('EVOLUTION24_API_KEY');
  return url && key ? { id: 'v24', url, key } : null;
}

export async function evoServerForCompany(db: any, companyId?: string | null): Promise<EvoServer | null> {
  if (!companyId || typeof companyId !== 'string') return defaultEvoServer();
  // Se a tabela ainda não existe (migration pendente) ou a consulta falha, segue no servidor atual.
  const { data, error } = await db.from('whatsapp_evolution_routing').select('server').eq('company_id', companyId).maybeSingle();
  if (error || data?.server !== 'v24') return defaultEvoServer();
  return v24EvoServer();
}

export async function evoServerForInstance(db: any, instanceName?: string | null): Promise<EvoServer | null> {
  if (!instanceName || typeof instanceName !== 'string') return defaultEvoServer();
  const { data } = await db.from('whatsapp_instances').select('company_id').eq('instance_name', instanceName).maybeSingle();
  return evoServerForCompany(db, data?.company_id);
}

export async function resolveEvoServer(db: any, p: { companyId?: unknown; instanceName?: unknown }): Promise<EvoServer | null> {
  if (typeof p.companyId === 'string' && p.companyId) return evoServerForCompany(db, p.companyId);
  return evoServerForInstance(db, typeof p.instanceName === 'string' ? p.instanceName : null);
}

// A Evolution 2.4 manda no webhook o token da PRÓPRIA instância (não a chave global,
// como a 2.3.x). Confere esse token consultando a Evolution 2.4 com a chave global.
export async function v24TokenMatches(server: EvoServer, instanceName: string, token: unknown): Promise<boolean> {
  if (typeof token !== 'string' || token.length < 16 || !/^ct-[a-zA-Z0-9-]+$/.test(instanceName)) return false;
  try {
    const res = await fetch(`${server.url.replace(/\/$/, '')}/instance/fetchInstances?instanceName=${encodeURIComponent(instanceName)}`, {
      headers: { apikey: server.key }, signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return false;
    const data = await res.json();
    const found = (Array.isArray(data) ? data : [data]).find((i: any) => (i?.name ?? i?.instance?.instanceName) === instanceName);
    return !!found && found.token === token;
  } catch {
    return false;
  }
}
