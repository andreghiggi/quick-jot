// ─────────────────────────────────────────────────────────────────────────────
// TEF Auto Print v1.1 — após aprovação do TEF, abre um MODAL rápido perguntando
// quais vias imprimir. Não imprime mais sozinho.
//
// IMPORTANTE: este arquivo é INDEPENDENTE de:
//   - src/utils/tefOrderActions.ts (reimpressão MANUAL — congelado)
//   - src/services/pinpadService.ts (TEF v1.0/1.1/1.2 beta — congelado)
//   - supabase/functions/tef-webservice/* (homologação Multiplus — congelado)
//
// Disponível para TODAS as lojas que tenham o módulo PDV V2 habilitado
// (company_modules.module_name = 'pdv_v2', enabled = true).
// Setting `store_settings.tef_auto_print_vias` define a opção pré-selecionada
// no modal: 'none' | 'estabelecimento' | 'ambas' (default 'ambas').
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/integrations/supabase/client';

export type TefAutoPrintMode = 'none' | 'estabelecimento' | 'ambas';

/**
 * Auto-print TEF é permitido para qualquer empresa com o módulo PDV V2
 * habilitado em `company_modules`. Consulta assíncrona para refletir o
 * estado real do toggle por loja.
 */
export async function isTefAutoPrintAllowed(
  companyId?: string | null,
): Promise<boolean> {
  if (!companyId) return false;
  try {
    const { data } = await supabase
      .from('company_modules')
      .select('enabled')
      .eq('company_id', companyId)
      .eq('module_name', 'pdv_v2')
      .maybeSingle();
    return !!data?.enabled;
  } catch {
    return false;
  }
}

async function fetchAutoPrintMode(companyId: string): Promise<TefAutoPrintMode> {
  try {
    const { data } = await supabase
      .from('store_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'tef_auto_print_vias')
      .maybeSingle();
    const v = (data?.value || '').toLowerCase();
    if (v === 'none' || v === 'estabelecimento' || v === 'ambas') return v;
    return 'ambas'; // default p/ lojas na allow-list
  } catch {
    return 'ambas';
  }
}

function buildHtml(receiptText: string, viaLabel: string, orderCode?: string): string {
  const safe = receiptText
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Comprovante TEF ${orderCode || ''} - ${viaLabel}</title>
  <style>
    @page { margin: 0; size: 58mm auto; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'Courier New', monospace;
      font-size: 10pt;
      font-weight: bold;
      width: 58mm;
      max-width: 58mm;
      padding: 2mm;
      line-height: 1.3;
      white-space: pre-wrap;
      -webkit-print-color-adjust: exact;
    }
    .header { text-align: center; margin-bottom: 2mm; font-size: 9pt; }
    .divider { border-top: 1px dashed #000; margin: 2mm 0; }
    .footer { text-align: center; font-size: 8pt; margin-top: 2mm; }
    pre.receipt { font: inherit; white-space: pre-wrap; word-break: break-word; margin: 0; }
  </style>
</head>
<body>
  <div class="header">${viaLabel}${orderCode ? ` - #${orderCode}` : ''}</div>
  <div class="divider"></div>
<pre class="receipt">${safe}</pre>
  <div class="divider"></div>
  <div class="footer">${viaLabel}</div>
  <script>window.onload=function(){setTimeout(function(){window.print();window.close();},200);}</script>
</body>
</html>`;
}

function normalizeReceipt(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n|\r/g, '\n')
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, ''))
    .join('\n');
}

/**
 * Multiplus retorna em `receiptLines` o cupom inteiro contendo as DUAS vias
 * (Estabelecimento + Cliente) num único bloco. Precisamos localizar TODOS os
 * marcadores de via para segmentar corretamente e imprimir cada via em uma
 * folha separada.
 *
 * Marcadores observados:
 *  - Estabelecimento: "VIA ESTABELECIMENTO", "VIA DO ESTABELECIMENTO",
 *    "1ª VIA", "PRIMEIRA VIA", "VIA LOJISTA".
 *  - Cliente:         "VIA CLIENTE", "VIA DO CLIENTE", "2ª VIA",
 *    "SEGUNDA VIA".
 */
function splitVias(fullText: string): { estabelecimento: string; cliente: string | null } {
  const lines = fullText.split('\n');
  const reEstab = /^\s*[-=*\s]*(1[ªa\.\s]*\s*VIA|VIA\s+(DO\s+)?(ESTABELECIMENTO|LOJIST[AO])|PRIMEIRA\s+VIA)\b/i;
  const reCliente = /^\s*[-=*\s]*(2[ªa\.\s]*\s*VIA|VIA\s+(DO\s+)?CLIENTE|SEGUNDA\s+VIA)\b/i;

  // Coleta índices de todos os marcadores, com o tipo.
  const marks: Array<{ idx: number; kind: 'estab' | 'cliente' }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (reCliente.test(lines[i])) marks.push({ idx: i, kind: 'cliente' });
    else if (reEstab.test(lines[i])) marks.push({ idx: i, kind: 'estab' });
  }

  // Sem nenhum marcador → assume que todo o bloco é a via do estabelecimento.
  if (marks.length === 0) {
    return { estabelecimento: fullText, cliente: null };
  }

  // Prefixo antes do primeiro marcador (cabeçalho comum: dados do estab,
  // rede, etc.). Vamos preservá-lo em ambas as vias.
  const header = lines.slice(0, marks[0].idx).join('\n').replace(/\n+$/g, '');

  // Segmenta cada bloco entre marcadores.
  const segments: Array<{ kind: 'estab' | 'cliente'; text: string }> = [];
  for (let m = 0; m < marks.length; m++) {
    const start = marks[m].idx;
    const end = m + 1 < marks.length ? marks[m + 1].idx : lines.length;
    const text = lines.slice(start, end).join('\n').replace(/^\n+|\n+$/g, '');
    segments.push({ kind: marks[m].kind, text });
  }

  const estabSegs = segments.filter((s) => s.kind === 'estab').map((s) => s.text);
  const clienteSegs = segments.filter((s) => s.kind === 'cliente').map((s) => s.text);

  // Caso comum Multiplus: só um marcador "VIA CLIENTE" existe no meio.
  // Nesse caso, o que veio ANTES do marcador (header + resto) é o
  // estabelecimento; o que veio DEPOIS é o cliente.
  if (estabSegs.length === 0 && clienteSegs.length >= 1) {
    const firstClienteIdx = marks.find((x) => x.kind === 'cliente')!.idx;
    const estabelecimento = lines.slice(0, firstClienteIdx).join('\n').replace(/\n+$/g, '');
    const cliente = clienteSegs[0];
    return {
      estabelecimento: estabelecimento || cliente, // fallback se vier vazio
      cliente,
    };
  }

  const joinWithHeader = (body: string) =>
    header ? `${header}\n${body}` : body;

  const estabelecimento = estabSegs.length > 0
    ? joinWithHeader(estabSegs.join('\n'))
    : fullText;
  const cliente = clienteSegs.length > 0
    ? joinWithHeader(clienteSegs.join('\n'))
    : null;

  return { estabelecimento, cliente };
}

export interface ImprimirComprovanteTefAutomaticoArgs {
  companyId: string;
  receiptLines?: string[] | null;
  orderCode?: string;
}

/** Executa a impressão real, sem perguntar. */
export async function executarImpressaoTefVias(
  receiptLines: string[],
  mode: Exclude<TefAutoPrintMode, 'none'>,
  orderCode?: string,
): Promise<void> {
  const fullText = normalizeReceipt(receiptLines);
  const { estabelecimento, cliente } = splitVias(fullText);

  // Monta a lista de impressões: cada via = um job (uma folha separada).
  const jobs: Array<{ label: string; body: string }> = [];
  const estabBody = estabelecimento && estabelecimento.trim() ? estabelecimento : fullText;
  if (mode === 'ambas') {
    jobs.push({ label: 'VIA ESTABELECIMENTO', body: estabBody });
    jobs.push({ label: 'VIA CLIENTE', body: cliente || estabBody });
  } else {
    // Só estabelecimento.
    jobs.push({ label: 'VIA ESTABELECIMENTO', body: estabBody });
  }

  for (let i = 0; i < jobs.length; i++) {
    try {
      const w = window.open('', '_blank');
      if (!w) {
        console.warn('[tefAutoPrint] pop-up bloqueado — usar reimpressão manual');
        return;
      }
      w.document.write(buildHtml(jobs[i].body, jobs[i].label, orderCode));
      w.document.close();
      if (i < jobs.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      console.error('[tefAutoPrint] falha ao imprimir via', jobs[i].label, e);
    }
  }
}

// ── Bus simples para acionar o modal global ─────────────────────────────────
export interface TefPrintPromptPayload {
  receiptLines: string[];
  orderCode?: string;
  defaultMode: TefAutoPrintMode;
}

export const TEF_PRINT_PROMPT_EVENT = 'tef-auto-print-prompt';

/**
 * Hook de interceptação do prompt TEF. Quando setado, `imprimirComprovanteTefAutomatico`
 * NÃO dispara o evento global — em vez disso entrega o payload para o capturador.
 * Usado pela Frente de Caixa (v1.39.x) para consolidar o prompt de impressão TEF
 * com o pós-venda NFC-e em um único diálogo. Não afeta PDV V2/Pedido Express/Cobrança.
 */
let tefPromptCapture: ((payload: TefPrintPromptPayload) => void) | null = null;

export function setTefPromptCapture(
  capture: ((payload: TefPrintPromptPayload) => void) | null,
) {
  tefPromptCapture = capture;
}

/** Exporta o splitVias para reuso pela Frente de Caixa (prompt consolidado). */
export function splitTefVias(receiptLines: string[]): {
  estabelecimento: string;
  cliente: string | null;
  full: string;
} {
  const full = normalizeReceipt(receiptLines);
  const { estabelecimento, cliente } = splitVias(full);
  return { estabelecimento, cliente, full };
}

/**
 * Após TEF aprovado, dispara o modal perguntando quais vias imprimir.
 * Mantém o nome antigo para preservar os call-sites em pdvV2Tef e
 * PedidoExpressDialog. Se a empresa não estiver na allow-list ou não houver
 * receiptLines, é no-op.
 */
export async function imprimirComprovanteTefAutomatico(
  args: ImprimirComprovanteTefAutomaticoArgs,
): Promise<void> {
  const { companyId, receiptLines, orderCode } = args;
  if (!receiptLines || receiptLines.length === 0) return;
  const allowed = await isTefAutoPrintAllowed(companyId);
  if (!allowed) return;

  const defaultMode = await fetchAutoPrintMode(companyId);

  const payload: TefPrintPromptPayload = { receiptLines, orderCode, defaultMode };

  // Interceptação opcional (Frente de Caixa): consome o payload sem disparar
  // o diálogo global. Isolado: se nenhum capturador estiver registrado, o
  // comportamento original (evento global) é preservado.
  if (tefPromptCapture) {
    try {
      tefPromptCapture(payload);
      return;
    } catch (e) {
      console.error('[tefAutoPrint] captura falhou, caindo para evento global:', e);
    }
  }

  try {
    window.dispatchEvent(
      new CustomEvent<TefPrintPromptPayload>(TEF_PRINT_PROMPT_EVENT, {
        detail: payload,
      }),
    );
  } catch (e) {
    console.error('[tefAutoPrint] falha ao abrir prompt:', e);
  }
}