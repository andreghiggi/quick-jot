import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Truck, Store, Check, Loader2, RefreshCw, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { useOrderContext } from '@/contexts/OrderContext';
import { supabase } from '@/integrations/supabase/client';
import { buildFloralStages, nextStageStatus, isStageComplete, floralOrderAction, type FloralNotice, type StageStatus } from '@/lib/floristFulfillment';
import { floristUnpaidDeliveryWarning } from '@/lib/floristCharge';
import type { Order } from '@/types/order';
import { toast } from 'sonner';

const labels = { pending:'Pendente',ready_for_pickup:'Pronto para retirada',out_for_delivery:'Saiu para entrega',delivered:'Entregue',picked_up:'Retirado' };
const actions = { pending:'',ready_for_pickup:'Avisar retirada pronta',out_for_delivery:'Saiu para entrega',delivered:'Marcar entregue',picked_up:'Marcar retirado' };
const noticeLabels: Record<string,string> = {received:'Recebimento',confirmed:'Confirmação',ready_for_pickup:'Retirada pronta',out_for_delivery:'Saiu para entrega',delivered:'Entregue',completed:'Conclusão'};
const PICKUP_UNPAID_REASON = 'Conclua a cobrança antes de finalizar a retirada.';
export function FloristOrderStages({order,disableCompletion=false,disableReason,unpaid=false}: {order:Order;disableCompletion?:boolean;disableReason?:string;/** Pedido ainda não cobrado: retirada só conclui depois de cobrar; entrega pede confirmação. */unpaid?:boolean}) {
  const { advanceFloristStage } = useOrderContext();
  const client = useQueryClient();
  const [busy,setBusy] = useState<string | null>(null);
  const busyRef = useRef(false);
  const [uncertain,setUncertain] = useState<FloralNotice | null>(null);
  const [unpaidStep,setUnpaidStep] = useState<{stageId:string;target:StageStatus} | null>(null);
  const queryKey = ['florist-notices',order.companyId,order.id];
  const {data:notices=[],isError,refetch} = useQuery({queryKey,enabled:!!order.companyId,staleTime:30000,queryFn:async()=>{
    const {data,error} = await supabase.from('florist_notifications').select('id,stage_id,event,status,detail,created_at,lease_until').eq('company_id',order.companyId || '').eq('order_id',order.id).order('created_at');
    if(error) throw error;
    return (data || []) as FloralNotice[];
  }});
  const stageVersion = JSON.stringify(order.floristFulfillments);
  useEffect(()=>{void client.invalidateQueries({queryKey:['florist-notices',order.companyId,order.id]});},[client,order.companyId,order.id,order.confirmedAt,stageVersion]);
  const stages = buildFloralStages({items:order.items,createdAt:order.createdAt,deliveryAddress:order.deliveryAddress,customerName:order.customerName,stages:order.floristFulfillments});
  const pendingNotices = notices.filter(n=>!['accepted','skipped'].includes(n.status));
  const staleSending = pendingNotices.some(n=>n.status==='sending'&&n.lease_until&&new Date(n.lease_until).getTime()<Date.now());
  const deliveries = stages.filter(s=>s.mode==='delivery');
  const confirmed = !!order.confirmedAt || order.status !== 'pending';
  const cancelled = order.status==='canceled' || order.notes?.includes('[CANCELADA]');
  async function retry(notice?:FloralNotice, confirmUncertain=false) {
    if (!order.companyId || busyRef.current) return;
    busyRef.current=true;setBusy(notice?.id || 'resume');
    try {
      const result = await floralOrderAction({companyId:order.companyId,orderId:order.id,action:notice?'retry':'resume',noticeId:notice?.id,confirmUncertain});
      client.setQueryData(queryKey,result.notices);
      if(result.notices.some(n=>!['accepted','skipped'].includes(n.status))) toast.warning('Ainda há mensagens pendentes; confira o resultado no pedido.');
      else toast.success('Mensagens aceitas pelo serviço de WhatsApp.');
    }catch(error){toast.error(error instanceof Error?error.message:'Não foi possível reenviar');}
    finally{busyRef.current=false;setBusy(null);setUncertain(null);void client.invalidateQueries({queryKey});}
  }
  async function advance(stageId:string,target:StageStatus) {
    if(busyRef.current)return;busyRef.current=true;setBusy(stageId);
    try{await advanceFloristStage(order.id,stageId,target);}
    finally{busyRef.current=false;setBusy(null);setUnpaidStep(null);void client.invalidateQueries({queryKey});}
  }
  return <section className="my-3 min-w-0 border-t border-border pt-3" aria-label={`Remessas do pedido ${order.shortCode || ''}`}>
    <div className="space-y-3">
      {stages.map((stage)=>{
        const next=nextStageStatus(stage);
        const terminal=next==='picked_up'||next==='delivered';
        const pickupUnpaid=unpaid&&stage.mode==='pickup';
        const blocked=!!cancelled||!confirmed||order.status==='delivered'||(terminal&&(disableCompletion||pickupUnpaid));
        return <div key={stage.id} className="min-w-0 border-l-2 border-primary pl-3">
          <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
            {stage.mode==='delivery'?<Truck className="h-4 w-4 shrink-0 text-primary"/>:<Store className="h-4 w-4 shrink-0 text-primary"/>}
            <span>{stage.mode==='delivery'?`Entrega${deliveries.length>1?` ${deliveries.findIndex(s=>s.id===stage.id)+1}`:''}`:'Retirada na loja'}</span>
            <Badge variant={isStageComplete(stage)?'secondary':'outline'}>{labels[stage.status]}</Badge>
          </div>
          {stage.mode==='delivery'&&<p className="mt-1 break-words text-xs text-muted-foreground">{stage.date.split('-').reverse().join('/')} · {stage.slot || 'Horário a combinar'}{stage.recipientName?` · Para: ${stage.recipientName}`:''}</p>}
          <ul className="my-2 text-sm">{stage.items.map(item=><li key={item.id} className="break-words">{item.quantity}x {item.name}</li>)}</ul>
          {next&&<Button size="sm" variant="outline" className="h-auto min-h-9 max-w-full gap-2 whitespace-normal text-left" disabled={blocked||!!busy}
            title={terminal&&disableCompletion?disableReason:terminal&&pickupUnpaid?PICKUP_UNPAID_REASON:undefined} onClick={()=>{
              if(floristUnpaidDeliveryWarning({mode:stage.mode,target:next,unpaid})) setUnpaidStep({stageId:stage.id,target:next});
              else void advance(stage.id,next);
            }}>
            {busy===stage.id?<Loader2 className="h-4 w-4 shrink-0 animate-spin"/>:<Check className="h-4 w-4 shrink-0"/>}{actions[next]}
          </Button>}
        </div>;
      })}
    </div>
    {(notices.length>0||isError)&&<div className="mt-3 border-t border-border pt-2 text-xs">
      <div className="mb-1 flex items-center justify-between gap-2"><p className="flex items-center gap-1 font-semibold"><MessageCircle className="h-3.5 w-3.5"/>WhatsApp do comprador</p><Button variant="ghost" size="icon" className="h-6 w-6" aria-label="Atualizar mensagens" title="Atualizar mensagens" onClick={()=>void refetch()}><RefreshCw className="h-3 w-3"/></Button></div>
      {isError&&<p className="text-destructive">Não foi possível consultar as mensagens.</p>}
      {notices.filter(n=>n.status==='accepted').length>0&&<p className="text-muted-foreground">{notices.filter(n=>n.status==='accepted').length} mensagem(ns) aceita(s) pelo serviço · entrega não confirmada</p>}
      {pendingNotices.map(n=><div key={n.id} className="mt-1 flex flex-wrap items-center gap-2">
        <span className={n.status==='failed'||n.status==='uncertain'?'text-destructive':'text-muted-foreground'}>{noticeLabels[n.event] || n.event}: {n.status==='queued'?'aguardando envio':n.status==='sending'?'enviando':n.detail || 'Falha no envio'}</span>
        {['failed','uncertain'].includes(n.status)&&!cancelled&&<Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" disabled={!!busy} onClick={()=>n.status==='uncertain'?setUncertain(n):void retry(n)}><RefreshCw className="h-3 w-3"/>Reenviar</Button>}
      </div>)}
      {pendingNotices.some(n=>n.status==='queued')&&!pendingNotices.some(n=>['failed','uncertain','sending'].includes(n.status))&&!cancelled&&<Button variant="ghost" size="sm" disabled={!!busy} className="mt-1 h-7 gap-1 px-2 text-xs" onClick={()=>void retry()}><RefreshCw className="h-3 w-3"/>Retomar envios</Button>}
      {staleSending&&!cancelled&&<Button variant="ghost" size="sm" disabled={!!busy} className="mt-1 h-7 gap-1 px-2 text-xs" onClick={()=>void retry()}><RefreshCw className="h-3 w-3"/>Conferir envio interrompido</Button>}
    </div>}
    <AlertDialog open={!!unpaidStep} onOpenChange={open=>{if(!open&&!busy)setUnpaidStep(null);}}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Este pedido ainda não foi cobrado</AlertDialogTitle><AlertDialogDescription>{unpaidStep?.target==='delivered'?'Você está marcando a entrega como concluída sem cobrança registrada.':'A entrega vai sair sem cobrança registrada.'} Se o pagamento for na entrega ou já foi combinado, pode continuar e cobrar depois pelo botão Cobrar.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={!!busy}>Voltar e cobrar</AlertDialogCancel><AlertDialogAction disabled={!!busy} onClick={e=>{e.preventDefault();if(unpaidStep)void advance(unpaidStep.stageId,unpaidStep.target);}}>Continuar sem cobrar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
    <AlertDialog open={!!uncertain} onOpenChange={open=>{if(!open)setUncertain(null);}}>
      <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Reenviar mensagem com resultado incerto?</AlertDialogTitle><AlertDialogDescription>A mensagem pode ter sido enviada antes da conexão falhar. Confira a conversa do comprador no WhatsApp para evitar repetição.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={!!busy}>Voltar</AlertDialogCancel><AlertDialogAction disabled={!!busy} onClick={e=>{e.preventDefault();if(uncertain)void retry(uncertain,true);}}>Conferi, reenviar</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
    </AlertDialog>
  </section>;
}