import { describe, expect, it, vi } from 'vitest';
import { checkoutHandler } from '@/test/checkoutHandler';
import { settleBeforeFiscal } from '@/utils/checkoutSettlement';
function setup() {
  const events: string[] = [], storage = new Map<string, string>();
  let seq = 0;
  const noOp = vi.fn();
  const ctx = { submitGuard: { current: false }, pendingSale: { current: null },
    cart: [{ product_id: 'xis', product_name: 'Mesa 4', unit_price: 80, quantity: 1 }],
    currentRegister: { id: 'register' }, user: { id: 'operator' }, companyId: 'bon', subtotal: 80,
    pendingStorageKey: 'pending-bon-register', localStorage: { setItem: (k: string, v: string) => storage.set(k, v), removeItem: (k: string) => storage.delete(k) },
    crypto: { randomUUID: () => `stable-${seq++}` }, settleBeforeFiscal,
    setCart: vi.fn(() => events.push('carrinho')), setPayOpen: noOp, setInitialPaymentMethodId: noOp, setIsSubmitting: noOp, setTefStatus: noOp,
    toast: { error: noOp, success: noOp }, console: { error: noOp },
    persistFastSale: vi.fn(async (draft) => { events.push('venda');return draft.sale.id; }),
    emitNfceForSale: vi.fn(async (_args: unknown) => { events.push('fiscal'); }), fiscalEnabled: true,
    runTefPayment: vi.fn(), chargeTefBeforePopups: true, storeSettings: {}, window: { dispatchEvent: noOp },
  };
  return { ctx, events, run: checkoutHandler('src/components/pdv-v2/PDVV2FastCheckout.tsx', 'finishSale', ctx) };
}
const paid = { methodId: 'tef', methodName: 'Débito', finalTotal: 80, tefIntegration: 'tef_pinpad', prechargedTef: { tefData: { nsu: 'approved', valor: 80 }, notesFragment: 'NSU approved' } };
describe('handler real de Venda Rápida — cartão aprovado', () => {
  it('limpa o carrinho antes do fiscal sem cobrar TEF novamente', async () => {
    const flow = setup();await expect(flow.run(paid)).resolves.toBe(true);expect(flow.events).toEqual(['venda', 'carrinho', 'fiscal']);
    expect(flow.ctx.runTefPayment).not.toHaveBeenCalled();
    expect(flow.ctx.persistFastSale.mock.calls[0][0].sale.final_total).toBe(80);
  });
  it('falha de gravação retém venda/TEF e confirmação repete somente a gravação', async () => {
    const flow = setup();flow.ctx.persistFastSale.mockRejectedValueOnce(new Error('response lost'));
    await expect(flow.run(paid)).resolves.toBe(false);await expect(flow.run(paid)).resolves.toBe(true);
    expect(flow.ctx.persistFastSale.mock.calls.map(args => args[0].sale.id)).toEqual(['stable-0', 'stable-0']);
    expect(flow.ctx.runTefPayment).not.toHaveBeenCalled();expect(flow.ctx.setCart).toHaveBeenCalledTimes(1);
  });
  it('aprovação TEF existente exige fiscal mesmo que a configuração se altere', async () => {
    const flow = setup();flow.ctx.fiscalEnabled = false;
    await checkoutHandler('src/components/pdv-v2/PDVV2FastCheckout.tsx', 'finishSale', flow.ctx)(paid);
    expect(flow.ctx.emitNfceForSale).toHaveBeenCalledTimes(1);
  });
});