import { describe, expect, it } from 'vitest';
import { getNfceReceiptPayments, hasNfcePaymentReceipt, NFCE_PAYMENT_RECEIPT_COMPANY } from './nfceReceiptPayments';

const xml = (payments: string, change = '') => `<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe"><NFe><infNFe><pag>${payments}${change}</pag></infNFe></NFe></nfeProc>`;
const det = (code: string, value: string) => `<detPag><tPag>${code}</tPag><vPag>${value}</vPag></detPag>`;

describe('NFC-e receipt recorded payments', () => {
  it('preserves R$10 cash and R$5 PIX from XML over conflicting payload', () => {
    expect(getNfceReceiptPayments(xml(det('01', '10.00') + det('17', '5.00')), {
      pagamentos_split: [{ tipo: 'cash', valor: 15 }],
    })).toEqual({ payments: [
      { code: '01', label: 'Dinheiro', amountCents: 1000 },
      { code: '17', label: 'PIX', amountCents: 500 },
    ], changeCents: 0 });
  });
  it('falls back to cash + TEF PIX split without XML', () => {
    expect(getNfceReceiptPayments(null, { pagamentos_split: [
      { tipo: 'cash', valor: 10 }, { tipo: 'tef', valor: 5, tef: { tipo_pagamento: 'pix' } },
    ] }).payments.map(p => [p.label, p.amountCents])).toEqual([['Dinheiro', 1000], ['PIX', 500]]);
  });
  it('uses explicit XML change in cents', () => {
    expect(getNfceReceiptPayments(xml(det('01', '20.00'), '<vTroco>5.00</vTroco>'), {}).changeCents).toBe(500);
  });
  it('does not invent cash or change for missing payment data', () => {
    expect(getNfceReceiptPayments(null, { valor_total: 15 })).toEqual({ payments: [], changeCents: 0 });
  });
  it('supports prefixed XML, single payment and explicit no payment', () => {
    expect(getNfceReceiptPayments('<n:NFe xmlns:n="urn:nfe"><n:infNFe><n:pag><n:detPag><n:tPag>90</n:tPag><n:vPag>0.00</n:vPag></n:detPag></n:pag></n:infNFe></n:NFe>', {}).payments)
      .toEqual([{ code: '90', label: 'Sem pagamento', amountCents: 0 }]);
  });
  it('does not treat missing/invalid amounts as payments', () => {
    expect(getNfceReceiptPayments(xml('<detPag><tPag>01</tPag></detPag>' + det('17', '-5')), {}).payments).toEqual([]);
  });
  it('isolates rollout to Cozinha da Ruiva', () => {
    expect(hasNfcePaymentReceipt(NFCE_PAYMENT_RECEIPT_COMPANY)).toBe(true);
    expect(hasNfcePaymentReceipt('other-company')).toBe(false);
    expect(hasNfcePaymentReceipt('')).toBe(false);
  });
  it('falls back safely for malformed XML and rejects entity declarations', () => {
    for (const value of ['<NFe>', '<!DOCTYPE NFe [<!ENTITY a "secret">]><NFe/>']) {
      expect(getNfceReceiptPayments(value, { pag: { detPag: [{ tPag: '04', vPag: '15.00' }], vTroco: '0.00' } }).payments)
        .toEqual([{ code: '04', label: 'Cartão de débito', amountCents: 1500 }]);
    }
  });
});