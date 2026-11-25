import { describe, expect, it, vi } from 'vitest';
import { expressCheckoutPolicy, isIntegratedTef, settleBeforeFiscal } from './checkoutSettlement';

describe('limite entre quitação e transmissão fiscal', () => {
  it('R$80 quitados fecham a mesa antes da resposta fiscal', async () => {
    let resolveFiscal: (() => void) | undefined;
    const fiscalPending = new Promise<void>(resolve => { resolveFiscal = resolve; });
    const events: string[] = [];
    const done = settleBeforeFiscal(async () => { events.push('mesa fechada'); return 80; }, async amount => {
      expect(amount).toBe(80); events.push('nota solicitada'); await fiscalPending;
    });
    await Promise.resolve();
    expect(events).toEqual(['mesa fechada', 'nota solicitada']);
    resolveFiscal?.();
    await expect(done).resolves.toBe(80);
  });
  it('falha fiscal não desfaz a quitação ou mantém o carrinho para recobrança', async () => {
    const settle = vi.fn(async () => 'sale-80');
    await expect(settleBeforeFiscal(settle, async () => { throw new Error('timeout'); })).rejects.toThrow('timeout');
    expect(settle).toHaveBeenCalledTimes(1);
  });
  it('falha no registro impede transmissão fiscal', async () => {
    const emit = vi.fn();
    await expect(settleBeforeFiscal(async () => { throw new Error('não registrada'); }, emit)).rejects.toThrow();
    expect(emit).not.toHaveBeenCalled();
  });
});

describe('cobrança express direta', () => {
  it('TEF aprovado registra caixa e exige NFC-e mesmo sem override', () => {
    expect(expressCheckoutPolicy({ approvedTef: true, fiscalEnabled: true })).toEqual({ recordSale: true, emitNfce: true });
  });
  it('aprovação TEF existente nunca permite suprimir a tentativa fiscal por configuração', () => {
    expect(expressCheckoutPolicy({ approvedTef: true, fiscalEnabled: false })).toEqual({ recordSale: true, emitNfce: true });
  });
  it('enviar pedido não pago para cozinha não registra cobrança', () => {
    expect(expressCheckoutPolicy({ approvedTef: false, fiscalEnabled: true })).toEqual({ recordSale: false, emitNfce: false });
  });
  it('finalizar venda manual registra caixa sem exigir nota não selecionada', () => {
    expect(expressCheckoutPolicy({ approvedTef: false, finalizeNow: true, documentMode: 'sale_only', fiscalEnabled: true })).toEqual({ recordSale: true, emitNfce: false });
  });
});

describe('atalhos por integração cadastrada', () => {
  it.each(['tef_pinpad', 'tef_smartpos'])('%s encaminha à cobrança da maquininha', integration => {
    expect(isIntegratedTef(integration)).toBe(true);
  });
  it.each([undefined, null, '', 'manual', 'Cartão TEF', 'pix'])('não converte cartão/PIX manual (%s) em TEF', integration => {
    expect(isIntegratedTef(integration)).toBe(false);
  });
});