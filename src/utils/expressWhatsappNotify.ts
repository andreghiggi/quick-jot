import { supabase } from '@/integrations/supabase/client';
import { generateWhatsAppMessage } from '@/utils/whatsappMessages';
import { formatOrderItemWhatsApp } from '@/utils/formatOrderItemWhatsApp';
import { buildMenuLink } from '@/utils/menuLink';

/**
 * Pedido Express finalizado na hora (Amore Mio): o pedido nasce já em "preparing",
 * então não existe transição de status para disparar as mensagens iniciais.
 * Esta rotina envia, best-effort, a confirmação do pedido e, em seguida, o aviso
 * de "em preparo" — lendo o pedido direto do banco (evita estado local defasado).
 *
 * As mensagens de "pronto" e "entregue" continuam saindo por `updateOrderStatus`.
 */
export async function notifyExpressOrderCreated(
  companyId: string,
  orderId: string,
): Promise<void> {
  try {
    const { data: order } = await supabase
      .from('orders')
      .select('id, customer_name, customer_phone, delivery_address, notes, total, daily_number, order_code, confirmed_at')
      .eq('id', orderId)
      .maybeSingle();

    const phone = (order as any)?.customer_phone as string | undefined;
    if (!order || !phone) return;

    const { data: moduleData } = await supabase
      .from('company_modules')
      .select('enabled')
      .eq('company_id', companyId)
      .eq('module_name', 'whatsapp')
      .maybeSingle();
    if (!moduleData?.enabled) return;

    const { data: instanceData } = await supabase
      .from('whatsapp_instances')
      .select('instance_name, status')
      .eq('company_id', companyId)
      .maybeSingle();
    if (instanceData?.status !== 'connected' || !instanceData?.instance_name) return;

    const { data: companyData } = await supabase
      .from('companies')
      .select('name, address, slug, subdomain')
      .eq('id', companyId)
      .single();

    const { data: settings } = await supabase
      .from('store_settings')
      .select('key, value')
      .eq('company_id', companyId)
      .in('key', [
        'whatsapp_msg_pending',
        'whatsapp_msg_preparing',
        'estimated_wait_time',
      ]);

    const customTemplates: Record<string, string> = {};
    let estimatedWaitTime: string | undefined;
    settings?.forEach((s: any) => {
      if (s.key === 'estimated_wait_time' && s.value) estimatedWaitTime = s.value;
      if (s.key?.startsWith('whatsapp_msg_') && s.value) customTemplates[s.key] = s.value;
    });

    const { data: itemsData } = await supabase
      .from('order_items')
      .select('name, quantity, price, notes')
      .eq('order_id', orderId);

    const items = (itemsData || []).map((i: any) => ({
      name: i.name as string,
      quantity: i.quantity as number,
      price: Number(i.price),
      notes: (i.notes as string) || undefined,
    }));

    const deliveryAddress = (order as any).delivery_address as string | undefined;
    const notes = (order as any).notes as string | undefined;
    const isPickup = notes?.includes('Retirada') || !deliveryAddress;
    const menuLink = buildMenuLink(companyData as any);
    const storeName = companyData?.name || 'Estabelecimento';
    const customerName = (order as any).customer_name as string;
    const dailyNumber = Number((order as any).daily_number || 0);
    const orderCode = ((order as any).order_code as string) || '';
    const total = Number((order as any).total || 0);

    // Resumo do pedido (mesmo formato da confirmação padrão)
    let resumo = '';
    if (items.length > 0) {
      resumo += '\n' + items.map((item) => formatOrderItemWhatsApp(item)).join('\n\n');
      resumo += `\n\n💰 *Total: R$ ${total.toFixed(2).replace('.', ',')}*`;
    }
    if (notes) {
      const paymentMatch = notes.match(/Pagamento:\s*(.+?)(\s*[\(|]|$)/i);
      const paymentName = paymentMatch?.[1]?.trim();
      if (paymentName) resumo += `\n💳 *Pagamento:* ${paymentName}`;
    }
    resumo += deliveryAddress ? `\n🛵 *Entrega:* ${deliveryAddress}` : `\n🏪 *Retirada no local*`;

    const sendMessage = async (message: string) => {
      await supabase.functions.invoke('whatsapp-evolution', {
        body: {
          action: 'send_message',
          instanceName: instanceData.instance_name,
          phone,
          message,
          companyId,
          orderId,
        },
      });
    };

    // 1) Confirmação do pedido
    if (!(order as any).confirmed_at) {
      let confirmMsg = generateWhatsAppMessage({
        customerName,
        orderNumber: dailyNumber,
        orderCode,
        status: 'pending',
        storeName,
        deliveryType: isPickup ? 'retirada' : 'entrega',
        storeAddress: companyData?.address || undefined,
        customTemplates: Object.keys(customTemplates).length > 0 ? customTemplates : undefined,
        menuLink,
        resumo: resumo.trim(),
      });

      if (confirmMsg && !customTemplates['whatsapp_msg_pending']?.includes('{{resumo}}') && items.length > 0) {
        confirmMsg += '\n\n📋 *Resumo do pedido:*' + resumo;
      }

      if (confirmMsg) {
        await sendMessage(confirmMsg);
        await supabase
          .from('orders')
          .update({ confirmed_at: new Date().toISOString() } as any)
          .eq('id', orderId);
      }
    }

    // 2) Em preparo (pequeno intervalo para manter a ordem das mensagens)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const preparingMsg = generateWhatsAppMessage({
      customerName,
      orderNumber: dailyNumber,
      orderCode,
      status: 'preparing',
      storeName,
      deliveryType: isPickup ? 'retirada' : 'entrega',
      storeAddress: companyData?.address || undefined,
      estimatedTime: estimatedWaitTime,
      customTemplates: Object.keys(customTemplates).length > 0 ? customTemplates : undefined,
      menuLink,
    });

    if (preparingMsg) await sendMessage(preparingMsg);
  } catch (err) {
    console.error('[Express] Falha ao notificar cliente no WhatsApp:', err);
  }
}
