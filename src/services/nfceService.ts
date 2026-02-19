import { supabase } from '@/integrations/supabase/client';

export interface NFCeItem {
  codigo: string;
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  csosn: string;
  aliquota_icms: number;
  cst_pis: string;
  aliquota_pis: number;
  cst_cofins: string;
  aliquota_cofins: number;
}

export interface NFCeEmitRequest {
  external_id: string;
  itens: NFCeItem[];
  valor_desconto?: number;
  valor_frete?: number;
  observacoes?: string;
}

export interface NFCeRecord {
  id: string;
  company_id: string;
  sale_id: string | null;
  external_id: string;
  nfce_id: string | null;
  numero: string | null;
  serie: string | null;
  chave_acesso: string | null;
  protocolo: string | null;
  status: string;
  ambiente: string | null;
  valor_total: number;
  qrcode_url: string | null;
  motivo_rejeicao: string | null;
  created_at: string;
  updated_at: string;
}

async function callNFCeProxy(body: Record<string, any>) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Usuário não autenticado');

  const response = await supabase.functions.invoke('nfce-proxy', {
    body,
  });

  if (response.error) {
    throw new Error(response.error.message || 'Erro na API NFC-e');
  }

  return response.data;
}

export async function emitirNFCe(
  companyId: string,
  saleId: string | null,
  payload: NFCeEmitRequest
) {
  return callNFCeProxy({
    action: 'emitir',
    companyId,
    saleId,
    payload,
  });
}

export async function consultarNFCe(companyId: string, nfceId: string) {
  return callNFCeProxy({
    action: 'consultar',
    companyId,
    nfceId,
  });
}

export async function cancelarNFCe(companyId: string, nfceId: string, justificativa: string) {
  return callNFCeProxy({
    action: 'cancelar',
    companyId,
    nfceId,
    payload: { justificativa },
  });
}

export async function reprocessarNFCe(companyId: string, nfceId: string) {
  return callNFCeProxy({
    action: 'reprocessar',
    companyId,
    nfceId,
  });
}

export async function listarNFCe(companyId: string, filtros?: Record<string, string>) {
  return callNFCeProxy({
    action: 'listar',
    companyId,
    payload: filtros,
  });
}

export async function getDanfeNFCe(companyId: string, nfceId: string) {
  return callNFCeProxy({
    action: 'danfe',
    companyId,
    nfceId,
  });
}

export function printDanfe(danfeResult: any) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Pop-up bloqueado. Permita pop-ups para imprimir.');
  }

  if (danfeResult?.html) {
    // HTML content returned directly
    printWindow.document.write(danfeResult.html);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
  } else if (danfeResult?.data && danfeResult?.content_type?.includes('application/pdf')) {
    // PDF as base64
    const binaryStr = atob(danfeResult.data);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    printWindow.location.href = url;
    setTimeout(() => { printWindow.print(); }, 1000);
  } else if (danfeResult?.data?.danfe_url || danfeResult?.danfe_url) {
    // URL to DANFE
    const url = danfeResult?.data?.danfe_url || danfeResult?.danfe_url;
    printWindow.location.href = url;
  } else if (danfeResult?.success === false) {
    printWindow.close();
    throw new Error(danfeResult?.error || 'DANFE não disponível na API');
  } else {
    printWindow.close();
    throw new Error('Formato de DANFE não reconhecido. Verifique se a nota foi autorizada.');
  }
}

export async function getNFCeRecords(companyId: string, limit = 50): Promise<NFCeRecord[]> {
  const { data, error } = await supabase
    .from('nfce_records')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data || []) as unknown as NFCeRecord[];
}

export async function getNFCeRecordBySaleId(saleId: string): Promise<NFCeRecord | null> {
  const { data, error } = await supabase
    .from('nfce_records')
    .select('*')
    .eq('sale_id', saleId)
    .maybeSingle();

  if (error) throw error;
  return data as unknown as NFCeRecord | null;
}
