import { describe, expect, it } from 'vitest';
import { nfeRecipientItemErrors, type NfeValidationInput } from './nfeValidation';

const valid: NfeValidationInput = {
  tipo: 'pf', documento: '12345678901', nome: 'Cliente', logradouro: 'Rua', numero: '10', bairro: 'Centro',
  cidade: 'Guaporé', uf: 'RS', cep: '99200-000', ibge: '4309406', indIE: '9', ie: '', natureza: 'Venda',
  items: [{ descricao: 'Produto', ncm: '12345678', cfop: '5102', quantidade: 1, valor_unitario: 4 }],
};
describe('pendências preventivas NF-e', () => {
  it('aceita IBGE interno de 7 dígitos e NCM numérico de 8 dígitos', () => {
    expect(nfeRecipientItemErrors(valid)).toEqual([]);
  });
  it('não inventa IBGE quando o CEP está preenchido', () => {
    expect(nfeRecipientItemErrors({ ...valid, ibge: '' }).map(e => e.msg)).toEqual([
      'Destinatário: não foi possível identificar a cidade pelo CEP. Confira o CEP e tente novamente.',
    ]);
  });
  it.each(['210690', '123456789', 'abcdefgh'])('bloqueia NCM inválido %s', ncm => {
    expect(nfeRecipientItemErrors({ ...valid, items: [{ ...valid.items[0], ncm }] })).toHaveLength(1);
  });
  it('lista todos os campos inválidos, não apenas o primeiro', () => {
    expect(nfeRecipientItemErrors({ ...valid, cep: '', ibge: '', numero: '', bairro: '' })).toHaveLength(4);
  });
});