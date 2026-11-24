import { describe, it, expect } from 'vitest';
import { activeStoreOverride, effectiveSchedulingToday, effectiveStoreOpen, newStoreOverride, readStoreOverride, STORE_AVAILABILITY_KEY, storeLocalDate } from '../../supabase/functions/_shared/store-availability';
import { floralBusinessState, floralGreetingVariant } from '../../supabase/functions/_shared/florist-messages';

const now = new Date('2026-11-24T18:54:00Z');
const closed = JSON.stringify({ mode: 'closed', date: '2026-11-24' });
describe('Controle excepcional de atendimento', () => {
  it('um clique fecha mesmo durante o horário normal ou sempre aberto', () => expect(effectiveStoreOpen(true, closed, now)).toBe(false));
  it('um clique abre fora do horário sem reescrever os horários', () => expect(effectiveStoreOpen(false, newStoreOverride(true, now), now)).toBe(true));
  it('a alteração vale só para o dia em São Paulo', () => expect(newStoreOverride(false, new Date('2026-11-25T02:59:59Z'))).toEqual({ mode: 'closed', date: '2026-11-24' }));
  it('o dia seguinte retoma o horário normal aberto', () => expect(effectiveStoreOpen(true, closed, new Date('2026-11-25T03:00:00Z'))).toBe(true));
  it('o dia seguinte não força abertura fora do horário', () => expect(effectiveStoreOpen(false, newStoreOverride(true, now), new Date('2026-11-25T03:00:00Z'))).toBe(false));
  it('o fechamento por imprevisto não permite novos pedidos agendados hoje', () => expect(effectiveSchedulingToday(true, closed, now)).toBe(false));
  it('loja sem controle manual mantém o comportamento anterior', () => {
    expect(effectiveStoreOpen(true, null, now)).toBe(true);
    expect(effectiveStoreOpen(false, null, now)).toBe(false);
    expect(effectiveSchedulingToday(true, null, now)).toBe(true);
  });
  it('uma configuração inválida não inventa um fechamento', () => {
    expect(activeStoreOverride('{invalid', now)).toBeNull();
    expect(activeStoreOverride({ mode: 'unexpected', date: '2026-11-24' }, now)).toBeNull();
  });
  it('saudação floral respeita o fechamento mesmo com turno futuro', () => {
    const state = floralBusinessState([{day_of_week:2,is_open:true,always_open:true,open_time:'17:00',close_time:'21:00'}], now, closed);
    expect(state.isOpen).toBe(false);
    expect(state.canScheduleToday).toBe(false);
    expect(floralGreetingVariant(state, true)).toBe('whatsapp_florist_closed');
  });
  it('retorno floral ignora turnos do dia excepcionalmente fechado', () => {
    const state = floralBusinessState([{day_of_week:2,is_open:true,open_time:'17:00',close_time:'21:00'}, {day_of_week:3,is_open:true,open_time:'08:00',close_time:'18:00'}], now, closed);
    expect(state.returnTime).toBe('amanhã às 08:00');
  });
  it('a leitura do controle é isolada pela empresa', async () => {
    const calls: unknown[] = [];
    const query = { select: (value: unknown) => { calls.push(value); return query; }, eq: (key: string,value: string) => { calls.push([key,value]); return query; }, maybeSingle: async () => ({ data: {value:closed}, error:null }) };
    expect(await readStoreOverride({from:()=>query}, 'loja-a')).toBe(closed);
    expect(calls).toContainEqual(['company_id','loja-a']);
    expect(calls).toContainEqual(['key',STORE_AVAILABILITY_KEY]);
  });
  it('falha de consulta não permite presumir loja aberta', async () => {
    const query = { select:()=>query,eq:()=>query,maybeSingle:async()=>({data:null,error:{message:'unavailable'}}) };
    await expect(readStoreOverride({from:()=>query}, 'loja-b')).rejects.toThrow();
  });
  it('fuso é São Paulo e não a data UTC', () => expect(storeLocalDate(new Date('2026-11-25T02:30:00Z'))).toBe('2026-11-24'));
});