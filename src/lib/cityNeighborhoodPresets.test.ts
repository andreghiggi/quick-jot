import { describe, it, expect } from 'vitest';
import { presetForCep, resolveStoreNeighborhoodNames } from './cityNeighborhoodPresets';

describe('cityNeighborhoodPresets', () => {
  it('loja com CEP 99200-000 recebe bairros de Guaporé', () => {
    expect(presetForCep('99200-000')?.city).toBe('Guaporé');
    expect(resolveStoreNeighborhoodNames([], '99200-000')).toContain('Centro');
  });
  it('bairros cadastrados da loja têm prioridade', () => {
    expect(resolveStoreNeighborhoodNames(['Vila X'], '99200-000')).toEqual(['Vila X']);
  });
  it('CEP de outra cidade não carrega base', () => {
    expect(resolveStoreNeighborhoodNames([], '01001-000')).toEqual([]);
  });
});
