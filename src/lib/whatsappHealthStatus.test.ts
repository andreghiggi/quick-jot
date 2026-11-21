import { describe, it, expect } from 'vitest';
import { resolveDisplayStatus } from './whatsappHealthStatus';

describe('resolveDisplayStatus', () => {
  it('deaf + live open + recovery ready vira aguardando mensagens', () => {
    expect(resolveDisplayStatus('deaf', 'open', 'ready')).toBe('idle');
  });
  it('deaf sem verificação ao vivo continua surda', () => {
    expect(resolveDisplayStatus('deaf', undefined, 'ready')).toBe('deaf');
  });
  it('deaf com recuperação falhando continua surda', () => {
    expect(resolveDisplayStatus('deaf', 'open', 'needs_qr')).toBe('deaf');
  });
  it('ao vivo fechada mostra desconectada', () => {
    expect(resolveDisplayStatus('ok', 'close', 'ready')).toBe('disconnected');
  });
});
