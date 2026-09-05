// ─────────────────────────────────────────────────────────────────────────────
// Frente de Caixa — impressão ANTECIPADA das vias do TEF.
//
// Motivação: hoje as vias do cartão só saem no diálogo pós-venda, depois que a
// NFC-e resolve. Quando a SEFAZ demora, o comprovante (pronto desde a aprovação
// no pinpad) espera junto, gerando 40s–1min de sensação de travamento.
//
// Este utilitário imprime as vias IMEDIATAMENTE após a aprovação do TEF,
// enquanto a NFC-e é emitida em paralelo. Best-effort: nunca lança.
//
// ESCOPO: usado APENAS por `src/pages/FrenteCaixa.tsx`.
// NÃO altera pinpadService, pdvV2Tef, tefOrderActions, tef-webservice,
// nfce-proxy, PDV V2, Pedido Express ou cobrança por card.
// ─────────────────────────────────────────────────────────────────────────────

import {
  buildTefViaHtml,
  splitTefVias,
  type TefAutoPrintMode,
  type TefPrintPromptPayload,
} from '@/utils/tefAutoPrint';

/** Lojas do piloto. Para liberar geral, basta retornar `true` em `isTefEarlyPrintPilot`. */
const TEF_EARLY_PRINT_PILOT_IDS = new Set<string>([
  '55181771-8b10-4af1-afc3-472c090a49be', // Cozinha da Ruiva
  '8c9e7a0e-dbb6-49b9-8344-c23155a71164', // Lancheria da I9
]);

export function isTefEarlyPrintPilot(companyId?: string | null): boolean {
  return !!companyId && TEF_EARLY_PRINT_PILOT_IDS.has(companyId);
}

/**
 * Imprime um documento via <iframe> oculto — não depende de pop-up.
 * Fallback para quando `window.open` é bloqueado pelo Chrome (a impressão
 * acontece fora do gesto do operador, pois o clique em "Cobrar" já expirou
 * durante a transação no pinpad).
 */
function printViaIframe(html: string): Promise<void> {
  return new Promise<void>((resolve) => {
    let settled = false;
    const done = (iframe?: HTMLIFrameElement) => {
      if (settled) return;
      settled = true;
      setTimeout(() => {
        try { if (iframe) document.body.removeChild(iframe); } catch { /* noop */ }
      }, 1500);
      resolve();
    };
    try {
      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.setAttribute('aria-hidden', 'true');
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          if (win) {
            win.focus();
            win.print();
          }
        } catch { /* noop */ }
        done(iframe);
      };
      const doc = iframe.contentWindow?.document;
      if (!doc) {
        done(iframe);
        return;
      }
      // O HTML das vias já contém um script que chama window.print(); em
      // iframe usamos o onload acima, então removemos o auto-print/close
      // para não fechar o frame antes da hora.
      const safeHtml = html.replace(/<script[\s\S]*?<\/script>/gi, '');
      doc.open();
      doc.write(safeHtml);
      doc.close();
    } catch {
      done();
    }
  });
}

/**
 * Impressão imediata das vias do TEF, respeitando a preferência da loja
 * (`store_settings.tef_auto_print_vias`) já resolvida no payload.
 *
 * @returns `true` quando as vias foram enviadas para impressão,
 *          `false` quando não havia nada a imprimir (modo 'none' / sem linhas).
 */
export async function imprimirViasTefImediato(
  payload: TefPrintPromptPayload | null | undefined,
): Promise<boolean> {
  try {
    if (!payload?.receiptLines?.length) return false;
    const mode: TefAutoPrintMode = payload.defaultMode || 'ambas';
    if (mode === 'none') return false;

    const { estabelecimento, cliente, full } = splitTefVias(payload.receiptLines);
    const estabBody = estabelecimento?.trim() ? estabelecimento : full;

    const jobs: Array<{ label: string; body: string }> = [
      { label: 'VIA ESTABELECIMENTO', body: estabBody },
    ];
    if (mode === 'ambas') {
      jobs.push({ label: 'VIA CLIENTE', body: cliente || estabBody });
    }

    for (let i = 0; i < jobs.length; i++) {
      const html = buildTefViaHtml(jobs[i].body, jobs[i].label, payload.orderCode);
      let printed = false;
      try {
        const w = window.open('', '_blank');
        if (w) {
          w.document.write(html);
          w.document.close();
          printed = true;
        }
      } catch { /* noop — cai no iframe */ }
      if (!printed) {
        // eslint-disable-next-line no-await-in-loop
        await printViaIframe(html);
      }
      if (i < jobs.length - 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    return true;
  } catch (e) {
    console.error('[tefEarlyPrint] falha na impressão antecipada das vias:', e);
    return false;
  }
}
