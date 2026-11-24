import { describe,it,expect } from 'vitest';
import { buildFloralStages,allStagesComplete,nextStageStatus } from '../../supabase/functions/_shared/florist-fulfillment';
import { floralBusinessState,floralGreetingVariant } from '../../supabase/functions/_shared/florist-messages';
const items = [
  {id:'a',name:'Buquê de 12 Rosas',quantity:1,notes:'DESTINO 1: PRESENTE | Entrega 10/12/2026 09:00–12:00 | Recebe: Maria (51999887766) | Endereço: Rua A, 1 - Centro'},
  {id:'b',name:'Buquê',quantity:1,notes:'DESTINO 2: PRESENTE | Entrega 11/12/2026 14:00–16:00 | Recebe: Maria (51999887766) | Endereço: Rua A, 1 - Centro'},
  {id:'c',name:'Vaso de Suculenta',quantity:1,notes:'DESTINO 3: Para o comprador | Retirada na loja'},
];
describe('floral remessas',()=>{
  it('dois buquês em datas diferentes e retirada própria são três etapas',()=>{
    const stages=buildFloralStages({items,createdAt:'2026-11-24T12:00:00-03:00'});
    expect(stages).toHaveLength(3);
    expect(stages.filter(s=>s.mode==='delivery').map(s=>s.date)).toEqual(['2026-12-10','2026-12-11']);
    expect(stages.find(s=>s.mode==='pickup')?.items.map(i=>i.name)).toEqual(['Vaso de Suculenta']);
  });
  it('retirada pronta não conclui o pedido',()=>expect(allStagesComplete([{id:'r',mode:'pickup',itemIds:['c'],status:'ready_for_pickup'}])).toBe(false));
  it('conclui somente após entregar os dois buquês e retirar o vaso',()=>{
    const stages=buildFloralStages({items,createdAt:new Date()});
    const done=stages.map(s=>({...s,status:s.mode==='delivery'?'delivered' as const:'picked_up' as const}));
    expect(allStagesComplete(done)).toBe(true);
    expect(allStagesComplete(done.map(s=>s.mode==='pickup'?{...s,status:'ready_for_pickup' as const}:s))).toBe(false);
  });
  it('pedido sem etapas não pode concluir',()=>expect(allStagesComplete([])).toBe(false));
  it('retirada precisa ficar pronta antes de ser retirada',()=>{
    expect(nextStageStatus({mode:'pickup',status:'pending'})).toBe('ready_for_pickup');
    expect(nextStageStatus({mode:'pickup',status:'ready_for_pickup'})).toBe('picked_up');
  });
  it('entrega precisa sair antes de ser entregue',()=>{
    expect(nextStageStatus({mode:'delivery',status:'pending'})).toBe('out_for_delivery');
    expect(nextStageStatus({mode:'delivery',status:'out_for_delivery'})).toBe('delivered');
    expect(nextStageStatus({mode:'delivery',status:'delivered'})).toBeUndefined();
  });
  it('agrupa itens do mesmo destino sem perder quantidades',()=>{
    const stages=buildFloralStages({items:[items[0],{...items[0],id:'a2',quantity:2}],createdAt:new Date()});
    expect(stages).toHaveLength(1);expect(stages[0].items.reduce((sum,i)=>sum+i.quantity,0)).toBe(3);
  });
});
describe('floral atendimento',()=>{
  const hours=[{day_of_week:2,is_open:true,open_time:'08:00',close_time:'12:00'}, {day_of_week:2,is_open:true,open_time:'14:00',close_time:'18:00'}];
  it('retorno durante intervalo é hoje às 14h no fuso de São Paulo',()=>expect(floralBusinessState(hours,new Date('2026-11-24T16:00:00Z')).returnTime).toBe('hoje às 14:00'));
  it('sem agendamento usa variação de consulta mesmo com abertura futura',()=>expect(floralGreetingVariant(floralBusinessState(hours,new Date('2026-11-24T16:00:00Z')),false)).toBe('whatsapp_florist_closed'));
  it('com agendamento e próximo período hoje usa a variação correspondente',()=>expect(floralGreetingVariant(floralBusinessState(hours,new Date('2026-11-24T16:00:00Z')),true)).toBe('whatsapp_florist_closed_scheduling'));
  it('não promete agendamento após o último período pois catálogo não aceita nesse estado',()=>expect(floralGreetingVariant(floralBusinessState(hours,new Date('2026-11-25T01:00:00Z')),true)).toBe('whatsapp_florist_closed'));
  it('sempre aberto prevalece em qualquer dia',()=>expect(floralBusinessState([{...hours[0],always_open:true}],new Date('2026-11-29T03:00:00Z')).isOpen).toBe(true));
  it('dia ausente é fechado, não aberto por engano',()=>expect(floralBusinessState(hours,new Date('2026-11-29T15:00:00Z')).isOpen).toBe(false));
  it('retorno amanhã informa o dia seguinte',()=>expect(floralBusinessState([{day_of_week:3,is_open:true,open_time:'08:00',close_time:'18:00'}],new Date('2026-11-24T23:00:00Z')).returnTime).toBe('amanhã às 08:00'));
  it('domingo fechado informa segunda-feira, não inventa abertura hoje',()=>expect(floralBusinessState([{day_of_week:1,is_open:true,open_time:'08:00',close_time:'18:00'}],new Date('2026-11-28T23:00:00Z')).returnTime).toBe('segunda-feira às 08:00'));
});