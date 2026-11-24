import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  read: vi.fn(), write: vi.fn(), filters: [] as Array<[string, string]>,
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: {
  from: (table: string) => {
    if (table !== 'store_settings') throw new Error('Unexpected table');
    return {
      select: () => {
        const query = {
          eq: (field: string, value: string) => { db.filters.push([field, value]); return query; },
          maybeSingle: () => db.read(),
        };
        return query;
      },
      upsert: (payload: unknown, options: unknown) => ({
        select: () => ({ single: () => db.write(payload, options) }),
      }),
    };
  },
} }));

import { FLORIST_SAME_DAY_KEY, patchSameDayConfig, saveDeliveryToday, spDate } from './floristSameDay';

const current = { pickupMinutes: 150, leadMinutes: 240, sameDayDelivery: true, closedDate: null };
beforeEach(() => {
  db.filters.length = 0;
  db.read.mockReset().mockResolvedValue({ data: { value: JSON.stringify(current) }, error: null });
  db.write.mockReset().mockImplementation(async (payload) => ({ data: { value: payload.value }, error: null }));
});

describe('persistência do controle rápido floral', () => {
  it('lê e grava só a loja indicada, preservando retirada e antecedência atuais', async () => {
    const result = await saveDeliveryToday('loja-a', false);
    expect(db.filters).toEqual([['company_id', 'loja-a'], ['key', FLORIST_SAME_DAY_KEY]]);
    expect(result).toEqual({ ...current, closedDate: spDate() });
    expect(db.write.mock.calls[0][0]).toMatchObject({ company_id: 'loja-a', key: FLORIST_SAME_DAY_KEY });
    expect(db.write.mock.calls[0][1]).toEqual({ onConflict: 'key,company_id' });
  });
  it('reabrir remove só a data de encerramento', async () => {
    db.read.mockResolvedValue({ data: { value: JSON.stringify({ ...current, closedDate: spDate() }) }, error: null });
    expect(await saveDeliveryToday('loja-a', true)).toEqual(current);
  });
  it('alterar prazo nas configurações preserva o encerramento feito no topo', async () => {
    const closedDate = spDate();
    db.read.mockResolvedValue({ data: { value: JSON.stringify({ ...current, closedDate }) }, error: null });
    expect(await patchSameDayConfig('loja-a', { pickupMinutes: 180 })).toEqual({ ...current, closedDate, pickupMinutes: 180 });
  });
  it('falha de leitura não pode sobrescrever regras com padrões', async () => {
    db.read.mockResolvedValue({ data: null, error: new Error('Falha de leitura') });
    await expect(saveDeliveryToday('loja-a', false)).rejects.toThrow('Falha de leitura');
    expect(db.write).not.toHaveBeenCalled();
  });
  it('falha de gravação não retorna sucesso', async () => {
    db.write.mockResolvedValue({ data: null, error: new Error('Gravação negada') });
    await expect(saveDeliveryToday('loja-a', false)).rejects.toThrow('Gravação negada');
  });
  it('não habilita entregas proibidas pela configuração permanente', async () => {
    db.read.mockResolvedValue({ data: { value: JSON.stringify({ ...current, sameDayDelivery: false }) }, error: null });
    await expect(saveDeliveryToday('loja-a', true)).rejects.toThrow();
    expect(db.write).not.toHaveBeenCalled();
  });
});