import { XMLParser, XMLValidator } from 'fast-xml-parser';

// Printing pilot only; expansion requires validation by the store.
export const NFCE_PAYMENT_RECEIPT_COMPANY = '55181771-8b10-4af1-afc3-472c090a49be';
export const hasNfcePaymentReceipt = (companyId: string) => companyId === NFCE_PAYMENT_RECEIPT_COMPANY;

const labels: Record<string, string> = {
  '01': 'Dinheiro', '02': 'Cheque', '03': 'Cartão de crédito', '04': 'Cartão de débito',
  '05': 'Crédito da loja', '10': 'Vale alimentação', '11': 'Vale refeição',
  '12': 'Vale presente', '13': 'Vale combustível', '15': 'Boleto bancário',
  '16': 'Depósito bancário', '17': 'PIX', '18': 'Transferência bancária',
  '19': 'Programa de fidelidade', '20': 'PIX', '21': 'Crédito em loja',
  '22': 'Pagamento eletrônico não informado', '90': 'Sem pagamento', '99': 'Outros',
};

export interface ReceiptPayments {
  payments: Array<{ code: string; label: string; amountCents: number }>;
  changeCents: number;
}

function cents(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const amount = Number(typeof value === 'string' ? value.replace(',', '.') : value);
  return Number.isFinite(amount) && amount >= 0 ? Math.round(amount * 100) : null;
}

const array = (value: any): any[] => value == null ? [] : Array.isArray(value) ? value : [value];
const codeOf = (value: unknown) => String(value ?? '99').padStart(2, '0');

export function getNfceReceiptPayments(xml: string | null | undefined, payload: any): ReceiptPayments {
  let group: any;
  if (xml && !/<!DOCTYPE|<!ENTITY/i.test(xml) && XMLValidator.validate(xml) === true) {
    try {
      const parsed = new XMLParser({ removeNSPrefix: true, parseTagValue: false, processEntities: false }).parse(xml);
      group = (parsed.nfeProc?.NFe ?? parsed.NFe)?.infNFe?.pag;
    } catch { /* Invalid/unavailable XML falls back to the original request. */ }
  }
  let entries = array(group?.detPag);
  let change = cents(group?.vTroco);
  if (!entries.length) {
    entries = array(payload?.pag?.detPag ?? payload?.detPag);
    change = cents(payload?.pag?.vTroco ?? payload?.vTroco);
  }
  if (!entries.length) {
    entries = array(payload?.pagamentos_split).map((entry) => ({
      tPag: entry.tipo === 'tef'
        ? ({ credit: '03', debit: '04', pix: '17' } as Record<string, string>)[entry.tef?.tipo_pagamento] ?? '99'
        : ({ cash: '01', pix: '17', crediario: '05' } as Record<string, string>)[entry.tipo] ?? '99',
      vPag: entry.valor,
    }));
  }
  if (!entries.length && payload?.tef) {
    entries = [{
      tPag: ({ credit: '03', debit: '04', pix: '17' } as Record<string, string>)[payload.tef.tipo_pagamento] ?? '99',
      vPag: payload.tef.valor,
    }];
  }
  const payments = entries.flatMap((entry) => {
    const amountCents = cents(entry.vPag);
    if (amountCents === null) return [];
    const code = codeOf(entry.tPag);
    return [{ code, label: code === '99' && entry.xPag ? String(entry.xPag) : labels[code] ?? `Pagamento (${code})`, amountCents }];
  });
  // Never infer cash or change from the total: only recorded fiscal/payment data.
  return { payments, changeCents: change ?? 0 };
}

export const formatReceiptCents = (value: number) => (value / 100).toLocaleString('pt-BR', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});