import { describe, expect, it } from 'vitest';
import { resolveCepNeighborhood, neighborhoodOptions, toggleAddressLabel, addressLabelDisabled } from './addressFormRules';

describe('Approved local address rules', () => {
  it('general CEP 99200-000 leaves neighborhood choice to the store list', () => {
    const viaCep99200000 = { bairro: '', localidade: 'Guaporé', uf: 'RS' };
    expect(resolveCepNeighborhood(viaCep99200000.bairro, ['Centro', 'São Cristóvão'])).toEqual({ neighborhood: '', specific: false });
    expect(neighborhoodOptions(['Centro', 'São Cristóvão'], '')).toEqual(['Centro', 'São Cristóvão']);
  });
  it('specific CEP resolves accents and casing to the configured neighborhood', () => {
    expect(resolveCepNeighborhood('sao cristovao', ['Centro', 'São Cristóvão'])).toEqual({ neighborhood: 'São Cristóvão', specific: true });
  });
  it('specific neighborhood absent from configured list remains visible', () => {
    expect(neighborhoodOptions(['Centro'], 'Bela Vista')).toEqual(['Centro', 'Bela Vista']);
  });
  it('selecting Casa disables Trabalho but clicking Casa again clears it', () => {
    const selected = toggleAddressLabel('', 'Casa');
    expect(selected).toBe('Casa');
    expect(addressLabelDisabled(selected, 'Trabalho')).toBe(true);
    expect(addressLabelDisabled(selected, 'Casa')).toBe(false);
    expect(toggleAddressLabel(selected, 'Casa')).toBe('');
  });
  it('selecting Trabalho disables Casa and custom labels allow both suggestions', () => {
    expect(addressLabelDisabled('Trabalho', 'Casa')).toBe(true);
    expect(addressLabelDisabled('Apartamento', 'Casa')).toBe(false);
    expect(addressLabelDisabled('Apartamento', 'Trabalho')).toBe(false);
  });
});