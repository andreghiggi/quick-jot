import { supabase } from '@/integrations/supabase/client';
import { nfeFailureMessage } from '@/lib/nfeErrors';

function hasErrorShape(data: any): boolean {
  return !!data && typeof data === 'object' && (data.error || data.success === false || data.ok === false);
}

async function callNfeProxy(body: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Usuário não autenticado');

  const response = await supabase.functions.invoke('nfe-proxy', { body });

  if (response.error) {
    const providerMsg = nfeFailureMessage((response as any).data);
    const baseMsg = response.error.message || 'Erro na API NF-e';
    console.error('[nfeService] proxy error', { baseMsg, providerMsg, data: (response as any).data });
    throw new Error(providerMsg ? `${baseMsg}: ${providerMsg}` : baseMsg);
  }

  if (hasErrorShape(response.data)) {
    throw new Error(nfeFailureMessage(response.data) || 'Erro na API NF-e');
  }

  return response.data;
}

export async function consultarNFe(companyId: string, nfeId: string) {
  return callNfeProxy({ action: 'consultar', companyId, nfeId });
}

export async function cancelarNFe(companyId: string, recordId: string, nfeId: string, justificativa: string) {
  return callNfeProxy({ action: 'cancelar', companyId, recordId, nfeId, payload: { justificativa } });
}

export async function enviarCceNFe(companyId: string, recordId: string, nfeId: string, correcao: string, sequencia?: number) {
  return callNfeProxy({ action: 'cce', companyId, recordId, nfeId, payload: { correcao, sequencia } });
}

/** Retransmite usando o mesmo request_payload já salvo no registro (rejeitada/rascunho). */
export async function reprocessarNFe(companyId: string, recordId: string, requestPayload: any) {
  return callNfeProxy({ action: 'emitir', companyId, recordId, payload: requestPayload });
}

/** Baixa o XML autorizado da NF-e via proxy (evita CORS e usa a x-api-key do servidor). */
export async function baixarXmlNFe(companyId: string, nfeId: string): Promise<string> {
  const data: any = await callNfeProxy({ action: 'xml', companyId, nfeId });
  const xml = data?.xml || data?.xml_retorno || data?.xml_proc
    || data?.data?.xml || data?.data?.xml_retorno || data?.data?.xml_proc;
  if (!xml || typeof xml !== 'string') {
    throw new Error('XML não disponível para esta NF-e');
  }
  return xml;
}
