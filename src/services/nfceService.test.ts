import { afterEach, describe, expect, it, vi } from 'vitest';
import * as receiptPayments from '@/lib/nfceReceiptPayments';
import { generateDanfeHtml, type NFCeRecord } from './nfceService';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

const xml = '<NFe><infNFe><pag><detPag><tPag>01</tPag><vPag>10.00</vPag></detPag><detPag><tPag>17</tPag><vPag>5.00</vPag></detPag></pag></infNFe></NFe>';
const legacyXml = '<NFe><infNFe><pag><detPag><tPag>01</tPag><vPag>15.00</vPag></detPag></pag></infNFe></NFe>';
const record: NFCeRecord = {
  id: 'receipt-test', company_id: receiptPayments.NFCE_PAYMENT_RECEIPT_COMPANY,
  sale_id: null, external_id: 'receipt-test', nfce_id: null, numero: null,
  serie: null, chave_acesso: null, protocolo: null, status: 'autorizada',
  ambiente: 'producao', valor_total: 15, qrcode_url: null,
  motivo_rejeicao: null, created_at: '', updated_at: '',
};

afterEach(() => vi.restoreAllMocks());

describe('NFC-e receipt persisted XML selection', () => {
  it('reads R$10 cash and R$5 PIX from xml_content before legacy XML or request', async () => {
    const parser = vi.spyOn(receiptPayments, 'getNfceReceiptPayments');
    const payload = { pagamentos_split: [{ tipo: 'cash', valor: 15 }] };
    await generateDanfeHtml({ ...record, xml_content: xml, xml_retorno: legacyXml, request_payload: payload });
    expect(parser).toHaveBeenCalledWith(xml, payload);
    expect(parser.mock.results[0]?.value.payments.map((p: { amountCents: number }) => p.amountCents)).toEqual([1000, 500]);
  });

  it('preserves legacy XML when xml_content is absent or empty', async () => {
    const parser = vi.spyOn(receiptPayments, 'getNfceReceiptPayments');
    for (const xml_content of [undefined, null, '']) {
      await generateDanfeHtml({ ...record, xml_content, xml_retorno: xml });
      expect(parser).toHaveBeenLastCalledWith(xml, undefined);
    }
  });

  it('retains persisted split payments when neither XML field is available', async () => {
    const parser = vi.spyOn(receiptPayments, 'getNfceReceiptPayments');
    const payload = { pagamentos_split: [
      { tipo: 'cash', valor: 10 }, { tipo: 'tef', valor: 5, tef: { tipo_pagamento: 'pix' } },
    ] };
    await generateDanfeHtml({ ...record, request_payload: payload });
    expect(parser).toHaveBeenCalledWith(undefined, payload);
    expect(parser.mock.results[0]?.value.payments.map((p: { amountCents: number }) => p.amountCents)).toEqual([1000, 500]);
  });
});