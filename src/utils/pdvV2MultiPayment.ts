/**
 * Orquestrador de pagamento com múltiplas formas (multi-payment).
 *
 * Executa, em sequência, cada linha de pagamento informada:
 *  - Linhas TEF (tef_pinpad/tef_smartpos) chamam `runTefPayment` (intocada).
 *  - Linhas não-TEF (dinheiro, PIX manual, etc.) são apenas registradas.
 *
 * Política de erro (Opção A — "tudo ou nada"):
 *  - Se uma linha TEF for recusada/cancelada, todas as linhas TEF já
 *    aprovadas nesta cobrança são ESTORNADAS automaticamente (CNC PinPad,
 *    mesmo helper usado em "Cancelar Venda"). A função retorna `{ok:false}`
 *    e o caller NÃO deve registrar venda nem emitir NFC-e.
 *
 * Nada aqui altera `runTefPayment`, `pinpadService` ou TEF v1.1 — apenas
 * chama as funções existentes em laço.
 */

import { toast } from 'sonner';
import { runTefPayment, type TefOptions } from '@/utils/pdvV2Tef';
import {
  reversePinpadTransaction,
  pollPinpadStatus,
  confirmPinpadTransaction,
} from '@/services/pinpadService';
import type { NFCeTefData } from '@/services/nfceService';

export type MultiPaymentInputLine = {
  payment_method_id: string;
  payment_name: string;
  amount: number;
  /** Quando definido, esta linha é cobrada via TEF (PinPad / SmartPOS). */
  integration?: 'tef_pinpad' | 'tef_smartpos';
  /** Apenas para linhas TEF. */
  tef_options?: TefOptions;
  /**
   * v1.7 sequential: linha já executada antes (pelo PDVV2SequentialPaymentDialog).
   * Quando presente, runMultiPayment NÃO chama runTefPayment de novo — apenas
   * repassa o resultado. Aditivo: chamadas v1.6 (sem este campo) seguem
   * comportamento original e estão preservadas.
   */
  _resolved?: MultiPaymentResolvedLine;
};

/** Linha resolvida (com dados TEF preenchidos quando aplicável). */
export type MultiPaymentResolvedLine = {
  payment_method_id: string;
  payment_name: string;
  amount: number;
  integration?: 'tef_pinpad' | 'tef_smartpos';
  /** Dados TEF aprovados — usados pelo nfce-proxy para montar `detPag`. */
  tef?: NFCeTefData;
  /** Número de controle (023-000) salvo para eventual estorno. */
  tef_control_number?: string;
  /** Trecho de notes do TEF (mesmo formato de runTefPayment). */
  notes_fragment?: string;
};

export interface RunMultiPaymentArgs {
  companyId: string;
  lines: MultiPaymentInputLine[];
  description?: string;
  onStatus?: (msg: string) => void;
}

export interface RunMultiPaymentResult {
  ok: boolean;
  errorMessage?: string;
  /** Linhas resolvidas (com TEF aprovado para as linhas TEF). */
  lines?: MultiPaymentResolvedLine[];
  /** Linha de maior valor — usada como `payment_method_id` da venda. */
  primary?: MultiPaymentResolvedLine;
  /** Trecho consolidado para anexar em `notes` da venda. */
  combinedNotesFragment?: string;
  /** Quantas linhas TEF foram estornadas em caso de falha. */
  rolledBackCount?: number;
}

function extractControlNumber(notesFragment?: string): string | undefined {
  if (!notesFragment) return undefined;
  const m = notesFragment.match(/\[TEF023\]([^\[]+)\[\/TEF023\]/);
  return m ? m[1].trim() : undefined;
}

/** Tenta estornar (CNC + CNF) uma transação TEF aprovada nesta cobrança. */
async function rollbackApprovedTef(
  companyId: string,
  line: MultiPaymentResolvedLine,
): Promise<boolean> {
  if (line.integration !== 'tef_pinpad' || !line.tef) return false;
  if (!line.tef_control_number) return false;
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dataTransacao = `${pad(now.getDate())}${pad(now.getMonth() + 1)}${now.getFullYear()}`;
  try {
    const res = await reversePinpadTransaction(companyId, {
      amount: line.amount,
      nsu: line.tef.nsu,
      rede: line.tef.adquirente || '',
      dataTransacao,
      horaTransacao: line.tef_control_number,
    });
    if (!res.success || !res.hash) return false;
    const cncIdentificacao = res.identificacao || '';
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 1500));
      const status = await pollPinpadStatus(companyId, res.hash);
      if (status.status === 'pending' || status.status === 'processing') continue;
      if (status.status === 'approved') {
        await confirmPinpadTransaction(companyId, {
          identificacao: cncIdentificacao,
          rede: status.acquirer,
          nsu: status.nsu,
          finalizacao: status.finalizacao,
        });
        return true;
      }
      return false;
    }
    return false;
  } catch {
    return false;
  }
}

/** Executa as linhas em sequência. Em qualquer falha TEF, estorna o que aprovou. */
export async function runMultiPayment(args: RunMultiPaymentArgs): Promise<RunMultiPaymentResult> {
  const { companyId, lines, description, onStatus } = args;
  const resolved: MultiPaymentResolvedLine[] = [];

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i];
    // v1.7 sequential: linha já aprovada anteriormente — passthrough.
    if (ln._resolved) {
      resolved.push(ln._resolved);
      continue;
    }
    if (!ln.integration) {
      // Linha não-TEF (dinheiro, PIX manual etc.) — apenas registra.
      resolved.push({
        payment_method_id: ln.payment_method_id,
        payment_name: ln.payment_name,
        amount: ln.amount,
        notes_fragment: `${ln.payment_name}: R$ ${ln.amount.toFixed(2)}`,
      });
      continue;
    }
    // Linha TEF
    onStatus?.(`Forma ${i + 1}/${lines.length} (${ln.payment_name}) — iniciando…`);
    const result = await runTefPayment({
      companyId,
      integration: ln.integration,
      amount: ln.amount,
      options: ln.tef_options || { modality: 'avista' },
      description,
      onStatus: (msg) => onStatus?.(`Forma ${i + 1}/${lines.length}: ${msg}`),
    });
    if (!result.success) {
      // ROLLBACK: estorna todas as linhas TEF aprovadas até agora.
      let rolledBackCount = 0;
      for (const prev of resolved) {
        if (prev.integration && prev.tef) {
          toast.info(`Estornando ${prev.payment_name} (R$ ${prev.amount.toFixed(2)})…`);
          const ok = await rollbackApprovedTef(companyId, prev);
          if (ok) rolledBackCount++;
          else toast.error(`Falha ao estornar ${prev.payment_name}. Cancele manualmente no gerenciador.`);
        }
      }
      return {
        ok: false,
        errorMessage: result.errorMessage || 'Cobrança recusada',
        rolledBackCount,
      };
    }
    resolved.push({
      payment_method_id: ln.payment_method_id,
      payment_name: ln.payment_name,
      amount: ln.amount,
      integration: ln.integration,
      tef: result.tefData,
      tef_control_number: extractControlNumber(result.notesFragment),
      notes_fragment: result.notesFragment,
    });
  }

  // Tudo aprovado.
  const primary = [...resolved].sort((a, b) => b.amount - a.amount)[0];
  const combinedNotesFragment = resolved
    .map((l) =>
      l.integration && l.notes_fragment
        ? `${l.payment_name} R$${l.amount.toFixed(2)}: ${l.notes_fragment}`
        : `${l.payment_name}: R$${l.amount.toFixed(2)}`,
    )
    .join(' || ');
  return {
    ok: true,
    lines: resolved,
    primary,
    combinedNotesFragment: `[MULTI] ${combinedNotesFragment}`,
  };
}

/** Converte linhas resolvidas no formato aceito pelo nfce-proxy (`pagamentos_split`). */
export function buildPagamentosSplit(
  lines: MultiPaymentResolvedLine[],
): Array<{ tipo: 'cash' | 'tef'; valor: number; tef?: NFCeTefData }> {
  return lines.map((l) => {
    if (l.integration && l.tef) {
      return { tipo: 'tef', valor: l.amount, tef: l.tef };
    }
    return { tipo: 'cash', valor: l.amount };
  });
}