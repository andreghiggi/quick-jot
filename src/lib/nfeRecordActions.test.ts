import { describe, expect, it } from 'vitest';
import { canEditNfe, canDeleteNfe, nfeEventTextValid } from '../../supabase/functions/_shared/nfe-record-actions';

describe('ações protegidas da NF-e', () => {
  it('permite editar rejeitada, mas nunca autorizada ou pendente', () => {
    expect(canEditNfe({ status: 'rejeitada' })).toBe(true);
    expect(canEditNfe({ status: 'autorizada' })).toBe(false);
    expect(canEditNfe({ status: 'pendente' })).toBe(false);
    expect(canEditNfe({ status: 'rejeitada', protocolo: '123' })).toBe(false);
  });
  it('exclui apenas rascunhos/rejeitadas sem identidade fiscal', () => {
    expect(canDeleteNfe({ status: 'rejeitada' })).toBe(true);
    expect(canDeleteNfe({ status: 'rascunho' })).toBe(true);
    expect(canDeleteNfe({ status: 'autorizada' })).toBe(false);
    expect(canDeleteNfe({ status: 'rejeitada', chave_acesso: '123' })).toBe(false);
    expect(canDeleteNfe({ status: 'rejeitada', protocolo: '123' })).toBe(false);
  });
  it('exige 15 caracteres para justificativa e correção', () => {
    expect(nfeEventTextValid('a'.repeat(14))).toBe(false);
    expect(nfeEventTextValid('a'.repeat(15))).toBe(true);
    expect(nfeEventTextValid('a'.repeat(1001))).toBe(false);
  });
});