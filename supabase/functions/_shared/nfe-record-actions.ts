export type NfeActionRecord = { status: string; chave_acesso?: string | null; protocolo?: string | null };

export function canEditNfe(record: NfeActionRecord): boolean {
  return ['rascunho', 'rejeitada'].includes(record.status) && !record.protocolo;
}

export function canDeleteNfe(record: NfeActionRecord): boolean {
  return canEditNfe(record) && !record.chave_acesso;
}

export function nfeEventTextValid(text: string): boolean {
  return text.trim().length >= 15 && text.trim().length <= 1000;
}