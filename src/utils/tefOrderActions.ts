// Helpers para ações de TEF em pedidos (cancelamento/estorno e reimpressão de comprovante).
// Compartilhado entre o OrderCard, PDV e outros pontos que exibem pedidos com pagamento TEF.

import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  reversePinpadTransaction,
  pollPinpadStatus,
  confirmPinpadTransaction,
} from '@/services/pinpadService';

export interface TefInfoFromNotes {
  type: 'pinpad' | 'smartpos';
  nsu: string;
  authCode: string;
  cardBrand: string;
  acquirer: string;
  receipt?: string;
  /** Rótulo legível do tipo de operação: "Débito", "Crédito à Vista", "3x Cartão ADM" etc. */
  operationType?: string;
}

/**
 * Extrai o rótulo do tipo de operação TEF a partir de um trecho de notes.
 * O PDV salva no formato: "... | ACQUIRER | Débito" ou "... | ACQUIRER | 3x Cartão ADM | [COMPROVANTE]..."
 * O segmento entre o adquirente e o próximo separador (| ou final) é o tipo.
 */
function extractTefOperationType(notes: string, afterMatchIndex: number): string | undefined {
  const tail = notes.slice(afterMatchIndex);
  // Pega o próximo segmento entre " | " e o próximo " | " ou fim de linha / [COMPROVANTE]
  const m = tail.match(/^\s*\|\s*([^|\n\[]+?)(?=\s*\||\s*\[|$)/);
  if (!m) return undefined;
  const label = m[1].trim();
  // Filtra valores que não são tipos de operação (ex: COMPROVANTE etc.)
  if (!label || /COMPROVANTE/i.test(label)) return undefined;
  return label;
}

/** Extrai NSU/Aut/Bandeira/Adquirente e o comprovante do campo `notes` de um pedido. */
export function parseTefDataFromNotes(notes: string | null | undefined): TefInfoFromNotes | null {
  if (!notes) return null;

  // Comprovante: [COMPROVANTE]...[/COMPROVANTE]
  const receiptMatch = notes.match(/\[COMPROVANTE\]([\s\S]*?)\[\/COMPROVANTE\]/);
  const receipt = receiptMatch ? receiptMatch[1].replace(/\\n/g, '\n') : undefined;

  // PinPad: "TEF PinPad: NSU 123 | Aut 456 | BRAND | ACQUIRER [| OPERAÇÃO]"
  const pinpadRegex = /TEF PinPad: NSU (\S+) \| Aut (\S+) \| ([^|]+) \| ([^|\n\[]+)/;
  const pinpadMatch = notes.match(pinpadRegex);
  if (pinpadMatch) {
    const matchEnd = (pinpadMatch.index ?? 0) + pinpadMatch[0].length;
    return {
      type: 'pinpad',
      nsu: pinpadMatch[1],
      authCode: pinpadMatch[2],
      cardBrand: pinpadMatch[3].trim(),
      acquirer: pinpadMatch[4].trim(),
      receipt,
      operationType: extractTefOperationType(notes, matchEnd),
    };
  }

  // SmartPOS: "TEF: NSU 123 | Aut 456 | BRAND [| OPERAÇÃO]"
  const smartposRegex = /TEF: NSU (\S+) \| Aut (\S+) \| ([^|\n\[]+)/;
  const smartposMatch = notes.match(smartposRegex);
  if (smartposMatch) {
    const matchEnd = (smartposMatch.index ?? 0) + smartposMatch[0].length;
    return {
      type: 'smartpos',
      nsu: smartposMatch[1],
      authCode: smartposMatch[2],
      cardBrand: smartposMatch[3].trim(),
      acquirer: '',
      receipt,
      operationType: extractTefOperationType(notes, matchEnd),
    };
  }

  return null;
}

/** Verifica se o pedido já foi marcado como cancelado/estornado. */
export function isOrderTefCancelled(notes: string | null | undefined): boolean {
  return !!notes && notes.includes('[CANCELADA]');
}

interface EstornoOptions {
  companyId: string;
  amount: number;
  createdAt: string | Date;
  notes: string | null | undefined;
}

interface EstornoResult {
  success: boolean;
  cancelledNotes?: string;
  message?: string;
}

/**
 * Dispara o estorno (CNC) no PinPad e, se aprovado, retorna as notes
 * com o prefixo [CANCELADA] já aplicado para o caller persistir.
 */
export async function estornarTefPedido(opts: EstornoOptions): Promise<EstornoResult> {
  const { companyId, amount, createdAt, notes } = opts;

  if (isOrderTefCancelled(notes)) {
    return { success: false, message: 'Esta venda já foi estornada/cancelada' };
  }

  const tefInfo = parseTefDataFromNotes(notes);
  if (!tefInfo) {
    return { success: false, message: 'Dados TEF não encontrados neste pedido' };
  }

  if (tefInfo.type !== 'pinpad') {
    return { success: false, message: 'Estorno automático disponível apenas para PinPad' };
  }

  const saleDate = new Date(createdAt);
  const dataTransacao = format(saleDate, 'ddMMyyyy');
  const horaTransacao = format(saleDate, 'HHmmss');

  const result = await reversePinpadTransaction(companyId, {
    amount,
    nsu: tefInfo.nsu,
    rede: tefInfo.acquirer,
    dataTransacao,
    horaTransacao,
  });

  if (!result.success || !result.hash) {
    return {
      success: false,
      message: result.errorMessage || 'Falha ao iniciar estorno no PinPad',
    };
  }

  const cncIdentificacao = result.identificacao || '';
  toast.info('Estorno enviado ao PinPad. Aguardando confirmação...');

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 1500));
    const status = await pollPinpadStatus(companyId, result.hash);

    if (status.status === 'approved') {
      await confirmPinpadTransaction(companyId, {
        identificacao: cncIdentificacao,
        rede: status.acquirer,
        nsu: status.nsu,
        finalizacao: status.finalizacao,
      });
      const cancelledNotes = `[CANCELADA] ${notes || ''}`.trim();
      return {
        success: true,
        cancelledNotes,
        message: `Estorno aprovado! NSU: ${status.nsu}`,
      };
    }

    if (['declined', 'error', 'cancelled'].includes(status.status)) {
      return {
        success: false,
        message: status.errorMessage || status.operatorMessage || 'Estorno não aprovado',
      };
    }
  }

  return { success: false, message: 'Timeout aguardando resposta do estorno' };
}

/** Reimprime o comprovante TEF (cupom da maquininha) salvo nas notes. */
export function reimprimirComprovanteTef(notes: string | null | undefined, orderCode?: string) {
  const tefInfo = parseTefDataFromNotes(notes);
  if (!tefInfo?.receipt) {
    toast.error('Comprovante TEF não disponível para este pedido');
    return;
  }

  // Normalização do comprovante para impressão:
  // 1. Garante que sequências literais "\n" virem quebra real (já tratado no parse, mas
  //    cobertura defensiva caso a fonte traga escapes adicionais);
  // 2. Normaliza CRLF/CR isolados em LF para o renderer não duplicar linhas em branco;
  // 3. Remove espaços ao final de cada linha.
  const normalizedReceipt = tefInfo.receipt
    .replace(/\\r\\n|\\n|\\r/g, '\n')
    .replace(/\r\n|\r/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/g, ''))
    .join('\n');

  // Escapa HTML para renderizar literalmente caracteres especiais no <pre>.
  const safeReceipt = normalizedReceipt
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    toast.error('Não foi possível abrir a janela de impressão');
    return;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Comprovante TEF ${orderCode || ''}</title>
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
  <div class="header">2ª VIA - COMPROVANTE TEF${orderCode ? ` #${orderCode}` : ''}</div>
  <div class="divider"></div>
<pre class="receipt">${safeReceipt}</pre>
  <div class="divider"></div>
  <div class="footer">Reimpressão</div>
  <script>window.onload=function(){setTimeout(function(){window.print();window.close();},200);}</script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}
