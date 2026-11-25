import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Regra: cobrança de mesa/comanda no PDV V2 com TEF pré-aprovado na PinPad
 * deve finalizar a venda e fechar a mesa imediatamente, sem abrir o diálogo
 * intermediário de NFC-e (que tinha botão "Cancelar" e deixava a mesa aberta
 * com o cartão já cobrado — incidente Bon Appetit, Mesa 4).
 *
 * Ambas as chamadas do PDVV2PaymentDialog em PDVV2.tsx (cobrar mesa/comanda
 * importada e cobrar comanda do PDV) precisam passar
 * autoFinalizeAfterPrechargedTef.
 */
describe('PDV V2 — finalização automática após TEF aprovado', () => {
  const source = readFileSync(resolve(__dirname, 'PDVV2.tsx'), 'utf8');

  // Cada bloco <PDVV2PaymentDialog ... /> do arquivo.
  const dialogBlocks = source.split('<PDVV2PaymentDialog').slice(1);

  it('PDVV2.tsx renderiza os dois diálogos de cobrança (mesa/comanda)', () => {
    expect(dialogBlocks.length).toBe(2);
  });

  it('todo diálogo de cobrança do PDV V2 finaliza direto após TEF aprovado', () => {
    for (const block of dialogBlocks) {
      expect(block).toContain('autoFinalizeAfterPrechargedTef');
    }
  });
});
