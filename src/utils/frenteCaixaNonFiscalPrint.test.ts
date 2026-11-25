import { beforeEach, describe, expect, it, vi } from 'vitest';
import { nonFiscalPrintAction, printNonFiscalSale, type NonFiscalReceipt } from './frenteCaixaNonFiscalPrint';
const queue = vi.hoisted(() => vi.fn());
vi.mock('@/utils/printRouting', () => ({ enqueueReceiptJob: queue }));
const i9 = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
beforeEach(() => queue.mockReset());
describe('impressão não fiscal isolada na Lancheria da I9', () => {
  it('imprime automaticamente ou pergunta somente no piloto escolhido', () => {
    expect(nonFiscalPrintAction(i9, 'nao_fiscal', 'auto')).toBe('auto');
    expect(nonFiscalPrintAction(i9, 'nao_fiscal', 'ask')).toBe('ask');
    expect(nonFiscalPrintAction(i9, 'nao_fiscal', 'off')).toBeNull();
    expect(nonFiscalPrintAction('32b71649-461d-4cb6-b26c-12390b090feb', 'nao_fiscal', 'auto')).toBeNull();
  });
  it('não duplica DANFE fiscal nem comprovante de crediário', () => {
    expect(nonFiscalPrintAction(i9, 'fiscal', 'auto')).toBeNull();
    expect(nonFiscalPrintAction(i9, 'nao_fiscal', 'auto', true)).toBeNull();
  });
  it('enfileira um comprovante real com identidade de venda para deduplicação', async () => {
    const receipt: NonFiscalReceipt = { companyId: i9, saleId: 'sale-80', storeName: 'I9', paperSize: '80mm',
      items: [{ name: 'Venda', quantity: 1, unitPrice: 80 }], discount: 0, surcharge: 0, total: 80,
      payments: [{ name: 'Dinheiro', amount: 80 }], issuedAt: new Date('2026-11-25T00:38:00Z') };
    await printNonFiscalSale(receipt);
    expect(queue).toHaveBeenCalledTimes(1);
    expect(queue).toHaveBeenCalledWith(expect.objectContaining({ companyId: i9, sourceOrderId: 'sale-80' }));
  });
  it('falha da fila é propagada, nunca confirma impressão fictícia', async () => {
    queue.mockRejectedValueOnce(new Error('printer offline'));
    await expect(printNonFiscalSale({ companyId: i9, saleId: 'sale-80', storeName: 'I9', paperSize: '80mm',
      items: [], discount: 0, surcharge: 0, total: 80, payments: [], issuedAt: new Date() })).rejects.toThrow('printer offline');
  });
});