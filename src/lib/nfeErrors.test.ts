import { describe, expect, it } from 'vitest';
import { nfeFailureMessage, readNfeInvokeError } from './nfeErrors';

describe('motivo da falha NF-e', () => {
  it('lê rejeição fiscal em resposta HTTP 422 sem perder a mensagem', async () => {
    expect(await readNfeInvokeError({ context: new Response(JSON.stringify({ result: { data: { xMotivo: 'Rejeição 778: NCM inexistente' } } }), { status: 422 }) }))
      .toBe('Rejeição 778: NCM inexistente');
  });
  it('preserva erro de configuração e não devolve dados do payload', () => {
    expect(nfeFailureMessage({ error: 'Token Fiscal Flow ausente.', request_payload: { secret: 'never-display' } })).toBe('Token Fiscal Flow ausente.');
    expect(nfeFailureMessage({ request_payload: { secret: 'never-display' } })).toBeNull();
  });
  it('preserva acesso negado sem tratá-lo como sucesso', async () => {
    expect(await readNfeInvokeError({ context: new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403 }) })).toBe('Acesso negado');
  });
});
describe('campos inválidos da validação prévia', () => {
  it('lista cada campo rejeitado em vez da mensagem genérica', () => {
    const msg = nfeFailureMessage({ result: { message: 'Validação prévia falhou', errors: { 'itens.0.ncm': ['deve ter 8 dígitos'], 'destinatario.endereco.codigo_municipio': ['obrigatório'] } } });
    expect(msg).toContain('Item 1: NCM (8 dígitos) — deve ter 8 dígitos');
    expect(msg).toContain('Destinatário: Cidade identificada pelo CEP');
  });
  it('aceita lista de erros com campo e mensagem', () => {
    expect(nfeFailureMessage({ message: 'Validação prévia falhou', errors: [{ field: 'itens[1].cfop', message: 'inválido' }] }))
      .toBe('Validação prévia falhou. Corrija: Item 2: CFOP — inválido');
  });
  it('reúne pendências em diferentes níveis da resposta sem perder erros aninhados', () => {
    const message = nfeFailureMessage({ message: 'Validação prévia falhou', errors: { 'itens.0.ncm': ['8 dígitos'] }, result: {
      data: { errors: { destinatario: { endereco: { cep: ['obrigatório'] } } } },
      request_payload: { token: 'never-display' },
    } });
    expect(message).toContain('Item 1: NCM (8 dígitos) — 8 dígitos');
    expect(message).toContain('Destinatário: CEP — obrigatório');
    expect(message).not.toContain('never-display');
  });
  it('lê detalhes dentro de error e caminhos em array', () => {
    expect(nfeFailureMessage({ error: { message: 'Validação prévia falhou', details: [{ path: ['itens', 1, 'ncm'], reason: 'inválido' }] } }))
      .toContain('Item 2: NCM (8 dígitos) — inválido');
  });
});
