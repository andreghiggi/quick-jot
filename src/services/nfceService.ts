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

export function generateDanfeHtml(record: NFCeRecord & { request_payload?: any }): string {
  const items = record.request_payload?.itens || [];
  const qrcodeUrl = record.qrcode_url || '';
  const chaveAcesso = record.chave_acesso || '';
  const chaveFormatada = chaveAcesso.replace(/(.{4})/g, '$1 ').trim();
  const dataEmissao = record.created_at ? new Date(record.created_at).toLocaleString('pt-BR') : '';
  const ambiente = record.ambiente === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO';

  const itemsHtml = items.map((item: any, i: number) => `
    <tr>
      <td style="text-align:left;padding:2px 4px;font-size:11px;">${String(i + 1).padStart(3, '0')} ${item.descricao || item.produto || ''}</td>
      <td style="text-align:center;padding:2px;font-size:11px;">${item.quantidade || 1}</td>
      <td style="text-align:right;padding:2px;font-size:11px;">${Number(item.valor_unitario || 0).toFixed(2)}</td>
      <td style="text-align:right;padding:2px 4px;font-size:11px;">${(Number(item.quantidade || 1) * Number(item.valor_unitario || 0)).toFixed(2)}</td>
    </tr>
  `).join('');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>DANFE NFC-e</title>
<style>
  @media print { body { margin: 0; } @page { size: 80mm auto; margin: 2mm; } }
  body { font-family: 'Courier New', monospace; width: 76mm; margin: 0 auto; padding: 4px; font-size: 12px; color: #000; }
  .center { text-align: center; }
  .separator { border-top: 1px dashed #000; margin: 4px 0; }
  table { width: 100%; border-collapse: collapse; }
  .title { font-weight: bold; font-size: 13px; }
  .small { font-size: 10px; }
  .qrcode { text-align: center; margin: 8px 0; }
  .qrcode img { max-width: 180px; }
</style></head><body>
  <div class="center title">DANFE NFC-e</div>
  <div class="center small">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
  <div class="separator"></div>
  
  <div class="center small" style="margin:4px 0;">
    ${record.ambiente !== 'producao' ? '<div style="font-weight:bold;font-size:14px;border:2px solid #000;padding:4px;margin:4px 0;">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL</div>' : ''}
  </div>

  <table>
    <thead>
      <tr style="border-bottom:1px solid #000;">
        <th style="text-align:left;padding:2px 4px;font-size:11px;">Descrição</th>
        <th style="text-align:center;padding:2px;font-size:11px;">Qtd</th>
        <th style="text-align:right;padding:2px;font-size:11px;">Unit</th>
        <th style="text-align:right;padding:2px 4px;font-size:11px;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="separator"></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;padding:2px 4px;">
    <span>TOTAL</span>
    <span>R$ ${Number(record.valor_total).toFixed(2)}</span>
  </div>
  <div class="separator"></div>

  ${qrcodeUrl ? `
  <div class="qrcode">
    <img src="https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrcodeUrl)}" alt="QR Code NFC-e" />
  </div>` : ''}

  <div class="center small" style="margin-top:4px;">
    <div style="font-weight:bold;">Consulte pela Chave de Acesso em</div>
    <div>www.nfce.fazenda.gov.br</div>
    <div style="word-break:break-all;margin-top:4px;font-size:9px;">${chaveFormatada}</div>
  </div>
  <div class="separator"></div>
  <div class="center small">
    ${record.numero ? `NFC-e nº ${record.numero} Série ${record.serie || '001'}` : ''}
    ${record.protocolo ? `<br>Protocolo: ${record.protocolo}` : ''}
    <br>Data: ${dataEmissao}
    <br>Ambiente: ${ambiente}
  </div>
</body></html>`;
}

export function printDanfeFromRecord(record: NFCeRecord & { request_payload?: any }) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    throw new Error('Pop-up bloqueado. Permita pop-ups para imprimir.');
  }
  const html = generateDanfeHtml(record);
  printWindow.document.write(html);
  printWindow.document.close();
  setTimeout(() => { printWindow.print(); }, 500);
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
