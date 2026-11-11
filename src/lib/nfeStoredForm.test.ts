import { describe, expect, it } from 'vitest';
import { nfeStoredForm } from './nfeStoredForm';
describe('reabertura da NF-e', () => {
  it('restaura destinatário, itens, pagamentos, transporte e adicionais de rejeitada antiga', () => {
    const f = nfeStoredForm({ external_id: 'old', numero: '12', chave_acesso: 'key', destinatario: { cpf: '123', endereco: { codigo_municipio: '4309609' } },
      itens: [{ codigo: 'P1' }], pagamentos: [{ tipo: '17', valor: 4 }], transporte: { modalidade_frete: '0', transportadora: { razao_social: 'Transportador' } },
      informacoes_adicionais: { contribuinte: 'Observação' } });
    expect(f.dest.cpf).toBe('123'); expect(f.dest.ibge).toBe('4309609');
    expect(f.items[0].codigo).toBe('P1'); expect(f.payments[0].valor).toBe(4);
    expect(f.transp.razao_social).toBe('Transportador'); expect(f.infCpl).toBe('Observação');
    expect(f.external_id).toBeUndefined(); expect(f.numero).toBeUndefined(); expect(f.chave_acesso).toBeUndefined();
  });
  it('preserva snapshot completo para edição', () => {
    const form = { items: [{ code: 'P1' }], terms: '30 dias' };
    expect(nfeStoredForm({ form })).toEqual(form);
  });
});