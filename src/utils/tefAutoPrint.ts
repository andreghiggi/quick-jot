// ─────────────────────────────────────────────────────────────────────────────
// TEF Auto Print v1 — impressão AUTOMÁTICA do comprovante TEF logo após
// aprovação da venda (1ª via).
//
// IMPORTANTE: este arquivo é INDEPENDENTE de:
//   - src/utils/tefOrderActions.ts (reimpressão MANUAL — congelado)
//   - src/services/pinpadService.ts (TEF v1.0/1.1/1.2 beta — congelado)
//   - supabase/functions/tef-webservice/* (homologação Multiplus — congelado)
//
// Não altera o fluxo TEF; é chamado APÓS o `confirmPinpadTransaction` aprovado,
// recebendo apenas as `receiptLines` já retornadas pelo gerenciador.
//
// Allow-list: por enquanto SOMENTE Lancheria da I9. Para liberar a outra
// loja, basta acrescentar o `company_id` em `TEF_AUTO_PRINT_ALLOWED`.
// Comportamento configurável via `store_settings.tef_auto_print_vias`:
//   - 'none'             → não imprime nada automaticamente
//   - 'estabelecimento'  → imprime 1 via (Estabelecimento)
//   - 'ambas' (padrão)   → imprime 2 vias (Estabelecimento + Cliente)
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from '@/integrations/supabase/client';

const TEF_AUTO_PRINT_ALLOWED = new Set<string>([
  '8c9e7a0e-dbb6-49b9-8344-c23155a71164', // Lancheria da I9
]);

export type TefAutoPrintMode = 'none' | 'estabelecimento' | 'ambas';

export function isTefAutoPrintAllowed(companyId?: string | null): boolean {
  return !!companyId && TEF_AUTO_PRINT_ALLOWED.has(companyId);
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

export interface ImprimirComprovanteTefAutomaticoArgs {
  companyId: string;
  receiptLines?: string[] | null;
  orderCode?: string;
}

/**
 * Dispara a impressão automática do comprovante TEF (1ª via).
 * Silencioso: não exibe toasts em caso de bloqueador de pop-up — não pode
 * interromper o fluxo de venda. Para reimpressão manual, segue valendo
 * `reimprimirComprovanteTef` (que marca como 2ª VIA).
 */
export async function imprimirComprovanteTefAutomatico(
  args: ImprimirComprovanteTefAutomaticoArgs,
): Promise<void> {
  const { companyId, receiptLines, orderCode } = args;
  if (!isTefAutoPrintAllowed(companyId)) return;
  if (!receiptLines || receiptLines.length === 0) return;

  const mode = await fetchAutoPrintMode(companyId);
  if (mode === 'none') return;

  const vias =
    mode === 'ambas'
      ? ['VIA ESTABELECIMENTO', 'VIA CLIENTE']
      : ['VIA ESTABELECIMENTO'];

  const receiptText = normalizeReceipt(receiptLines);

  for (let i = 0; i < vias.length; i++) {
    try {
      const w = window.open('', '_blank');
      if (!w) {
        console.warn('[tefAutoPrint] pop-up bloqueado — usar reimpressão manual');
        return;
      }
      w.document.write(buildHtml(receiptText, vias[i], orderCode));
      w.document.close();
      // pequena pausa entre janelas para o navegador não unificar a fila
      if (i < vias.length - 1) {
        await new Promise((r) => setTimeout(r, 400));
      }
    } catch (e) {
      console.error('[tefAutoPrint] falha ao imprimir via', vias[i], e);
    }
  }
}