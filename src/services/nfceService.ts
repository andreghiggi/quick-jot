import { supabase } from '@/integrations/supabase/client';
import QRCode from 'qrcode';

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

// Build SEFAZ QR Code URL from chave when not available in DB
function buildQrcodeUrlFromChave(chave: string, ambiente?: string | null): string | null {
  if (!chave || chave.length < 44) return null;
  const uf = chave.substring(0, 2);
  const sefazUrls: Record<string, string> = {
    '43': 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx',
    '35': 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica',
    '31': 'https://nfce.fazenda.mg.gov.br/portalnfce',
    '41': 'http://www.nfce.pr.gov.br/nfce/qrcode',
    '42': 'https://sat.sef.sc.gov.br/nfce/consulta',
    '33': 'https://www.nfce.fazenda.rj.gov.br/consulta',
    '29': 'https://nfe.sefaz.ba.gov.br/servicos/nfce/modulos/geral/NFCEC_consulta_chave_acesso.aspx',
  };
  const baseUrl = sefazUrls[uf];
  if (!baseUrl) return null;
  const ambienteCode = ambiente === 'producao' ? '1' : '2';
  return `${baseUrl}?p=${chave}|${ambienteCode}|2`;
}

export async function generateDanfeHtml(record: NFCeRecord & { request_payload?: any }): Promise<string> {
  const items = record.request_payload?.itens || [];
  // Use qrcode_url from DB, or build from chave_acesso as fallback
  const qrcodeUrl = record.qrcode_url || buildQrcodeUrlFromChave(record.chave_acesso || '', record.ambiente) || '';
  const chaveAcesso = record.chave_acesso || '';
  const chaveFormatada = chaveAcesso.replace(/(.{4})/g, '$1 ').trim();
  const dataEmissao = record.created_at ? new Date(record.created_at).toLocaleString('pt-BR') : '';
  const ambiente = record.ambiente === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO';

  const itemsHtml = items.map((item: any, i: number) => `
    <tr>
      <td style="text-align:left;padding:2px 4px;font-size:11px;">${String(i + 1).padStart(3, '0')} ${item.descricao || item.produto || ''}</td>
      <td style="text-align:center;padding:2px;font-size:11px;">${item.quantidade || 1}</td>
      <td style="text-align:right;padding:2px;font-size:11px;">R$${Number(item.valor_unitario || 0).toFixed(2)}</td>
      <td style="text-align:right;padding:2px 4px;font-size:11px;">R$${(Number(item.quantidade || 1) * Number(item.valor_unitario || 0)).toFixed(2)}</td>
    </tr>
  `).join('');

  // Generate QR Code as data URL using local library
  let qrCodeImg = '<p style="font-size:10px;color:#999;">[QR Code indisponível]</p>';
  if (qrcodeUrl) {
    try {
      const qrDataUrl = await QRCode.toDataURL(qrcodeUrl, { width: 200, margin: 1, errorCorrectionLevel: 'M' });
      qrCodeImg = `<img src="${qrDataUrl}" alt="QR Code NFC-e" style="max-width:200px;max-height:200px;" />`;
    } catch (e) {
      console.error('Erro ao gerar QR Code:', e);
    }
  }

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>DANFE NFC-e</title>
<style>
  @media print {
    body { margin: 0; }
    @page { size: 80mm auto; margin: 2mm; }
    .no-print { display: none; }
  }
  body { font-family: 'Courier New', monospace; width: 76mm; margin: 0 auto; padding: 4px; font-size: 12px; color: #000; background: #fff; }
  .center { text-align: center; }
  .separator { border-top: 1px dashed #000; margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; }
  .title { font-weight: bold; font-size: 14px; }
  .small { font-size: 10px; }
  .bold { font-weight: bold; }
  .qrcode { text-align: center; margin: 8px 0; }
  .homolog-warn { font-weight:bold; font-size:11px; border:2px solid #000; padding:3px; margin:4px 0; text-align:center; }
</style></head><body>

  <div class="center title">DANFE NFC-e</div>
  <div class="center small">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
  <div class="separator"></div>

  ${record.ambiente !== 'producao' ? '<div class="homolog-warn">AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL</div>' : ''}

  <table>
    <thead>
      <tr style="border-bottom:1px solid #000;">
        <th style="text-align:left;padding:2px 4px;font-size:10px;">Descrição</th>
        <th style="text-align:center;padding:2px;font-size:10px;">Qtd</th>
        <th style="text-align:right;padding:2px;font-size:10px;">Unit</th>
        <th style="text-align:right;padding:2px 4px;font-size:10px;">Total</th>
      </tr>
    </thead>
    <tbody>${itemsHtml || '<tr><td colspan="4" style="text-align:center;font-size:11px;padding:4px;">Itens não disponíveis</td></tr>'}</tbody>
  </table>

  <div class="separator"></div>
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;padding:2px 4px;">
    <span>TOTAL</span>
    <span>R$ ${Number(record.valor_total).toFixed(2)}</span>
  </div>
  <div class="separator"></div>

  <div class="qrcode">
    ${qrCodeImg}
  </div>

  <div class="center small" style="margin-top:4px;">
    <div class="bold">Consulte pela Chave de Acesso em</div>
    <div>www.nfce.fazenda.gov.br</div>
    <div style="word-break:break-all;margin-top:4px;font-size:9px;letter-spacing:1px;">${chaveFormatada || '—'}</div>
  </div>
  <div class="separator"></div>
  <div class="center small">
    ${record.numero ? `<div>NFC-e nº ${record.numero} Série ${record.serie || '001'}</div>` : ''}
    ${record.protocolo ? `<div>Protocolo: ${record.protocolo}</div>` : ''}
    <div>Data: ${dataEmissao}</div>
    <div>Ambiente: ${ambiente}</div>
  </div>
  <div class="separator"></div>

  <div class="no-print" style="text-align:center;margin-top:12px;">
    <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;">🖨️ Imprimir</button>
  </div>

</body></html>`;
}

export async function printDanfeFromRecord(record: NFCeRecord & { request_payload?: any }) {
  if (!record.chave_acesso && !record.qrcode_url) {
    throw new Error('Nota sem dados fiscais. Aguarde a autorização da SEFAZ para imprimir.');
  }

  const printWindow = window.open('', '_blank', 'width=420,height=750');
  if (!printWindow) {
    throw new Error('Pop-up bloqueado. Permita pop-ups para imprimir o DANFE.');
  }
  const html = await generateDanfeHtml(record);
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();
  // Wait for content to render, then print
  setTimeout(() => {
    try { printWindow.print(); } catch (_) {}
  }, 500);
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
