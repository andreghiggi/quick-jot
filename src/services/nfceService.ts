import { supabase } from '@/integrations/supabase/client';
import QRCode from 'qrcode';

/**
 * Opções extras de renderização do DANFE — todas opcionais.
 * Quando omitidas, mantém o comportamento original (compatibilidade total
 * com quem já chama `printDanfeFromRecord(record)` sem argumentos).
 *
 * Preenchidas exclusivamente pela Frente de Caixa a partir de `pdv_settings`.
 */
export interface DanfePrintOptions {
  companyLogoUrl?: string | null;
  companyName?: string | null;
  customerName?: string | null;
  customerDoc?: string | null;
  promoMessage?: string | null;
  reviewQrUrl?: string | null;
  copies?: number;
  show?: {
    logo?: boolean;
    customer?: boolean;
    discount?: boolean;
    surcharge?: boolean;
    serial?: boolean;
    saleNotes?: boolean;
    productNotes?: boolean;
    reviewQr?: boolean;
  };
}

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
  /** Código CEST (7 dígitos). Opcional — só é enviado quando preenchido. */
  cest?: string;
}

export interface NFCeTefData {
  nsu: string;
  autorizacao: string;
  bandeira: string;
  adquirente?: string;
  tipo_pagamento: 'credit' | 'debit' | 'pix';
  valor: number;
}

export interface NFCeEmitRequest {
  external_id: string;
  itens: NFCeItem[];
  valor_desconto?: number;
  valor_frete?: number;
  observacoes?: string;
  tef?: NFCeTefData;
  /**
   * Pagamento com múltiplas formas. Quando presente, o `nfce-proxy` ignora o
   * campo `tef` legado e monta vários `detPag` (1 por linha).
   * `tipo` = 'cash' (Dinheiro / não-TEF) ou 'tef' (cartão/PIX via maquininha).
   * Para 'tef', `tef` é obrigatório (NSU/Aut/Bandeira/Adquirente).
   */
  pagamentos_split?: Array<{ tipo: 'cash' | 'tef'; valor: number; tef?: NFCeTefData }>;
  /**
   * Destinatário da NFC-e (opcional). Quando omitido, a nota é emitida como
   * "consumidor não identificado" — comportamento padrão para vendas até R$ 10.000.
   */
  destinatario?: {
    cpf?: string;
    cnpj?: string;
    nome?: string;
  };
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
    // functions.invoke returns generic "non-2xx" when upstream returns 4xx/5xx.
    // Try to extract real provider message from response.data (still populated on errors).
    const data: any = (response as any).data;
    const ctx: any = (response.error as any)?.context;
    let providerMsg: string | undefined;
    if (data && typeof data === 'object') {
      providerMsg = data.error || data.mensagem || data.message
        || (data.erros && JSON.stringify(data.erros))
        || (data.raw && String(data.raw).slice(0, 300));
    }
    if (!providerMsg && ctx) {
      providerMsg = ctx?.error || ctx?.message;
    }
    const baseMsg = response.error.message || 'Erro na API NFC-e';
    const finalMsg = providerMsg ? `${baseMsg}: ${providerMsg}` : baseMsg;
    console.error('[nfceService] proxy error', { baseMsg, providerMsg, data, ctx });
    throw new Error(finalMsg);
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

/**
 * Recupera na FiscalFlow uma NFC-e já AUTORIZADA no SEFAZ (via chave de 44
 * dígitos) e sobrescreve o registro local — típico para consertar rejeição
 * 539 (duplicidade) quando a resposta de autorização se perdeu.
 */
export async function recuperarNFCePorChave(
  companyId: string,
  chaveAcesso: string,
  recordId?: string,
) {
  return callNFCeProxy({
    action: 'recuperar_por_chave',
    companyId,
    payload: { chave_acesso: chaveAcesso, record_id: recordId ?? null },
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

export async function generateDanfeHtml(
  record: NFCeRecord & { request_payload?: any },
  opts: DanfePrintOptions = {},
): Promise<string> {
  const items = record.request_payload?.itens || [];
  const observacoes: string = (record.request_payload?.observacoes || record.request_payload?.infCpl || '').toString().trim();
  const show = {
    logo: true,
    customer: true,
    discount: true,
    surcharge: true,
    serial: false,
    saleNotes: true,
    productNotes: true,
    reviewQr: false,
    ...(opts.show || {}),
  };
  // Use qrcode_url from DB, or build from chave_acesso as fallback
  const qrcodeUrl = record.qrcode_url || buildQrcodeUrlFromChave(record.chave_acesso || '', record.ambiente) || '';
  const chaveAcesso = record.chave_acesso || '';
  const chaveFormatada = chaveAcesso.replace(/(.{4})/g, '$1 ').trim();
  const dataEmissao = record.created_at ? new Date(record.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
  const ambiente = record.ambiente === 'producao' ? 'PRODUÇÃO' : 'HOMOLOGAÇÃO';

  const esc = (s: unknown) => String(s ?? '').replace(/[<>&]/g, (c) => (
    c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&amp;'
  ));

  const itemsHtml = items.map((item: any, i: number) => {
    const serial = show.serial && (item.serial || item.numero_serie || item.codigo)
      ? `<div style="font-size:9px;color:#333;">Cod/Série: ${esc(item.serial || item.numero_serie || item.codigo)}</div>`
      : '';
    const notes = show.productNotes && item.observacao
      ? `<div style="font-size:10px;color:#333;font-style:italic;">Obs: ${esc(item.observacao)}</div>`
      : '';
    return `
    <tr>
      <td style="text-align:left;padding:2px 4px;font-size:11px;">
        ${String(i + 1).padStart(3, '0')} ${esc(item.descricao || item.produto || '')}
        ${serial}
        ${notes}
      </td>
      <td style="text-align:center;padding:2px;font-size:11px;">${item.quantidade || 1}</td>
      <td style="text-align:right;padding:2px;font-size:11px;">R$${Number(item.valor_unitario || 0).toFixed(2)}</td>
      <td style="text-align:right;padding:2px 4px;font-size:11px;">R$${(Number(item.quantidade || 1) * Number(item.valor_unitario || 0)).toFixed(2)}</td>
    </tr>`;
  }).join('');

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

  // Blocos opcionais controlados pelos toggles do PDV
  const logoHtml = (show.logo && opts.companyLogoUrl)
    ? `<div class="center" style="margin-bottom:4px;"><img src="${esc(opts.companyLogoUrl)}" alt="logo" style="max-height:48px;max-width:70mm;object-fit:contain;" /></div>`
    : '';

  const customerHtml = (show.customer && (opts.customerName || opts.customerDoc || record.request_payload?.destinatario))
    ? (() => {
        const dest = record.request_payload?.destinatario || {};
        const nome = opts.customerName || dest.nome || '';
        const doc = opts.customerDoc || dest.cpf || dest.cnpj || '';
        return `<div class="small" style="padding:2px 4px;">
          <span class="bold">Cliente:</span> ${esc(nome || 'Consumidor')}${doc ? ` — ${esc(doc)}` : ''}
        </div><div class="separator"></div>`;
      })()
    : '';

  const desconto = Number(record.request_payload?.valor_desconto || 0);
  const acrescimo = Number(record.request_payload?.valor_acrescimo || record.request_payload?.valor_frete || 0);
  const totaisExtrasHtml = `
    ${show.discount && desconto > 0 ? `<div class="small" style="display:flex;justify-content:space-between;padding:0 4px;"><span>Desconto</span><span>- R$ ${desconto.toFixed(2)}</span></div>` : ''}
    ${show.surcharge && acrescimo > 0 ? `<div class="small" style="display:flex;justify-content:space-between;padding:0 4px;"><span>Acréscimo</span><span>+ R$ ${acrescimo.toFixed(2)}</span></div>` : ''}
  `;

  const saleNotesHtml = (show.saleNotes && observacoes)
    ? `<div class="small" style="padding:2px 4px;"><span class="bold">Observações:</span> ${esc(observacoes)}</div><div class="separator"></div>`
    : '';

  const promoHtml = opts.promoMessage
    ? `<div class="center small" style="padding:4px;font-style:italic;">${esc(opts.promoMessage)}</div>`
    : '';

  let reviewQrHtml = '';
  if (show.reviewQr && opts.reviewQrUrl) {
    try {
      const reviewData = await QRCode.toDataURL(opts.reviewQrUrl, { width: 120, margin: 1 });
      reviewQrHtml = `<div class="center" style="margin:6px 0;">
        <div class="small bold">Avalie sua compra</div>
        <img src="${reviewData}" alt="QR avaliação" style="width:100px;height:100px;" />
      </div>`;
    } catch (e) { console.error('Erro QR avaliação:', e); }
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

  ${logoHtml}
  <div class="center title">DANFE NFC-e</div>
  <div class="center small">Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
  ${opts.companyName ? `<div class="center small bold">${esc(opts.companyName)}</div>` : ''}
  <div class="separator"></div>

  ${record.ambiente !== 'producao' ? '<div class="homolog-warn">AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL</div>' : ''}

  ${customerHtml}
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
  ${totaisExtrasHtml}
  <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:14px;padding:2px 4px;">
    <span>TOTAL</span>
    <span>R$ ${Number(record.valor_total).toFixed(2)}</span>
  </div>
  <div class="separator"></div>

  ${saleNotesHtml}

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
  ${promoHtml ? `<div class="separator"></div>${promoHtml}` : ''}
  ${reviewQrHtml}
  <div class="separator"></div>

  <div class="no-print" style="text-align:center;margin-top:12px;">
    <button onclick="window.print()" style="padding:8px 20px;font-size:14px;cursor:pointer;">🖨️ Imprimir</button>
  </div>

</body></html>`;
}

export async function printDanfeFromRecord(
  record: NFCeRecord & { request_payload?: any },
  opts: DanfePrintOptions = {},
) {
  if (!record.chave_acesso && !record.qrcode_url) {
    throw new Error('Nota sem dados fiscais. Aguarde a autorização da SEFAZ para imprimir.');
  }
  const html = await generateDanfeHtml(record, opts);
  const copies = Math.max(1, opts.copies || 1);
  for (let i = 0; i < copies; i++) {
    const printWindow = window.open('', '_blank', 'width=420,height=750');
    if (!printWindow) {
      throw new Error('Pop-up bloqueado. Permita pop-ups para imprimir o DANFE.');
    }
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
    // Pequeno delay entre cópias para o navegador liberar a fila.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 500));
    try { printWindow.print(); } catch (_) {}
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

/**
 * Retorna o registro NFC-e vinculado a um pedido (via pdv_sales.order_id),
 * ou null se o pedido não tiver NFC-e emitida.
 * Usa `select('*, request_payload')` por padrão.
 */
export async function getNFCeRecordByOrderId(
  orderId: string,
): Promise<(NFCeRecord & { request_payload?: any }) | null> {
  // 1) Busca a pdv_sale do pedido
  const { data: sale, error: saleErr } = await supabase
    .from('pdv_sales')
    .select('id')
    .eq('order_id', orderId)
    .maybeSingle();
  if (saleErr || !sale?.id) return null;

  // 2) Busca o registro NFC-e vinculado à venda
  const { data, error } = await supabase
    .from('nfce_records')
    .select('*')
    .eq('sale_id', sale.id)
    .maybeSingle();
  if (error) return null;
  return (data as any) || null;
}
