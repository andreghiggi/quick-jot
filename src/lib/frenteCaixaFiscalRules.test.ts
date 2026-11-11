import { describe, expect, it } from 'vitest';
import { requiresFrenteCaixaNfce, resolveFrenteCaixaFiscalMode } from './frenteCaixaFiscalRules';

describe('Frente de Caixa — NFC-e obrigatória com TEF', () => {
  it.each(['tef_pinpad', 'tef_smartpos'])('força fiscal para R$ 5,00 via %s mesmo pedindo pré-venda', (integration) => {
    const lines = [{ amount: 10 }, { amount: 5, integration }];
    expect(requiresFrenteCaixaNfce(lines)).toBe(true);
    expect(resolveFrenteCaixaFiscalMode('nao_fiscal', lines)).toBe('fiscal');
  });
  it('ignora formas TEF sem valor alocado', () => {
    const lines = [{ amount: 15 }, { amount: 0, integration: 'tef_pinpad' }];
    expect(requiresFrenteCaixaNfce(lines)).toBe(false);
    expect(resolveFrenteCaixaFiscalMode('nao_fiscal', lines)).toBe('nao_fiscal');
  });
  it('preserva pré-venda para cartão manual e PIX sem TEF', () => {
    expect(resolveFrenteCaixaFiscalMode('nao_fiscal', [{ amount: 5, integration: 'manual' }, { amount: 10 }])).toBe('nao_fiscal');
  });
  it('preserva a escolha fiscal sem TEF', () => {
    expect(resolveFrenteCaixaFiscalMode('fiscal', [{ amount: 15 }])).toBe('fiscal');
  });
  it('dados de TEF aprovado obrigam fiscal mesmo sem marcador de integração', () => {
    expect(resolveFrenteCaixaFiscalMode('nao_fiscal', [{ amount: 5, tef: { nsu: '123' } }])).toBe('fiscal');
  });
  it('não transforma valores inválidos ou negativos em pagamento TEF', () => {
    expect(requiresFrenteCaixaNfce([{ amount: NaN, integration: 'tef_pinpad' }, { amount: -5, integration: 'tef_smartpos' }])).toBe(false);
  });
});