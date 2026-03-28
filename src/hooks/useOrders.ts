import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Order, OrderItem, OrderStatus } from '@/types/order';
import { toast } from 'sonner';
import { generateWhatsAppMessage } from '@/utils/whatsappMessages';
import { useOrderNotificationSound } from '@/hooks/useOrderNotificationSound';

interface UseOrdersOptions {
  companyId?: string | null;
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { companyId } = options;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const { checkAndNotify } = useOrderNotificationSound(!!companyId);
  const prevPendingCountRef = useRef<number | null>(null);
  const isInitialLoadRef = useRef(true);
  const prevOrdersJsonRef = useRef<string>('');

  async function fetchOrders() {
    // Don't fetch if no companyId - prevents showing orders from other companies
    if (!companyId) {
      setOrders([]);
      setLoading(false);
      return;
    }

    try {
      const ordersQuery = supabase
        .from('orders')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false });

      const { data: ordersData, error: ordersError } = await ordersQuery;

      if (ordersError) throw ordersError;

      // Get order IDs to fetch items
      const orderIds = (ordersData || []).map(o => o.id);
      
      let itemsData: any[] = [];
      if (orderIds.length > 0) {
        const { data, error: itemsError } = await supabase
          .from('order_items')
          .select('*')
          .in('order_id', orderIds);

        if (itemsError) throw itemsError;
        itemsData = data || [];
      }

      const mappedOrders: Order[] = (ordersData || []).map((order) => ({
        id: order.id,
        dailyNumber: (order as any).daily_number || 0,
        orderCode: (order as any).order_code || '',
        customerName: order.customer_name,
        customerPhone: order.customer_phone || undefined,
        deliveryAddress: order.delivery_address || undefined,
        notes: order.notes || undefined,
        total: Number(order.total),
        status: order.status as OrderStatus,
        createdAt: new Date(order.created_at),
        companyId: order.company_id || undefined,
        printed: (order as any).printed || false,
        printedAt: (order as any).printed_at ? new Date((order as any).printed_at) : undefined,
        items: itemsData
          .filter((item) => item.order_id === order.id)
          .map((item) => ({
            id: item.id,
            productId: item.product_id || '',
            name: item.name,
            quantity: item.quantity,
            price: Number(item.price),
            notes: item.notes || undefined,
          })),
      }));

      // Only update state if data actually changed to prevent unnecessary re-renders
      const ordersJson = JSON.stringify(mappedOrders.map(o => ({ id: o.id, status: o.status, total: o.total, items: o.items.length })));
      if (ordersJson !== prevOrdersJsonRef.current) {
        prevOrdersJsonRef.current = ordersJson;
        setOrders(mappedOrders);
      }
      // Check for new pending orders and play sound
      const pendingCount = mappedOrders.filter(o => o.status === 'pending').length;
      if (prevPendingCountRef.current !== null && pendingCount > prevPendingCountRef.current) {
        checkAndNotify(pendingCount);
        toast.info('🔔 Novo pedido recebido!', { duration: 5000 });
      }
      prevPendingCountRef.current = pendingCount;
    } catch (error) {
      console.error('Error fetching orders:', error);
      // Only show toast on initial load errors
      if (isInitialLoadRef.current) {
        toast.error('Erro ao carregar pedidos');
      }
    } finally {
      if (isInitialLoadRef.current) {
        isInitialLoadRef.current = false;
      }
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchOrders();

    // Auto-refresh every 30 seconds
    const refreshInterval = setInterval(() => {
      fetchOrders();
    }, 30000);

    // Subscribe to realtime updates
    const channel = supabase
      .channel(`orders-realtime-${companyId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `company_id=eq.${companyId}` },
        () => {
          fetchOrders();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items', filter: `company_id=eq.${companyId}` },
        () => {
          fetchOrders();
        }
      )
      .subscribe();

    return () => {
      clearInterval(refreshInterval);
      supabase.removeChannel(channel);
    };
  }, [companyId]);

  async function addOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'dailyNumber' | 'orderCode'>): Promise<boolean> {
    try {
      const { data: newOrder, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_name: orderData.customerName,
          customer_phone: orderData.customerPhone || null,
          delivery_address: orderData.deliveryAddress || null,
          notes: orderData.notes || null,
          total: orderData.total,
          status: orderData.status,
          company_id: orderData.companyId || companyId || null,
        })
        .select()
        .single();

      if (orderError) throw orderError;

      const orderItems = orderData.items.map((item) => ({
        order_id: newOrder.id,
        product_id: item.productId || null,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        notes: item.notes || null,
        company_id: orderData.companyId || companyId || null,
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Immediately update local state for instant feedback
      await fetchOrders();
      return true;
    } catch (error) {
      console.error('Error adding order:', error);
      toast.error('Erro ao criar pedido');
      return false;
    }
  }

  async function updateOrderStatus(orderId: string, status: OrderStatus): Promise<boolean> {
    try {
      // Optimistically update local state first for instant feedback
      setOrders(prevOrders => 
        prevOrders.map(order => 
          order.id === orderId ? { ...order, status } : order
        )
      );

      const { error } = await supabase
        .from('orders')
        .update({ status })
        .eq('id', orderId);

      if (error) {
        // Revert on error
        await fetchOrders();
        throw error;
      }

      // Send WhatsApp notification via Evolution API if module is enabled
      const order = orders.find((o) => o.id === orderId);
      if (order?.customerPhone && companyId) {
        try {
          // Check if whatsapp module is enabled
          const { data: moduleData } = await supabase
            .from('company_modules')
            .select('enabled')
            .eq('company_id', companyId)
            .eq('module_name', 'whatsapp')
            .maybeSingle();

          if (moduleData?.enabled) {
            // Check if instance is connected
            const { data: instanceData } = await supabase
              .from('whatsapp_instances')
              .select('instance_name, status')
              .eq('company_id', companyId)
              .maybeSingle();

            if (instanceData?.status === 'connected') {
              // Get store name and address
              const { data: companyData } = await supabase
                .from('companies')
                .select('name, address')
                .eq('id', companyId)
                .single();

              // Get google review URL from store settings
              let googleReviewUrl: string | undefined;
              let estimatedWaitTime: string | undefined;

              const { data: settings } = await supabase
                .from('store_settings')
                .select('key, value')
                .eq('company_id', companyId)
                .in('key', ['google_review_url', 'estimated_wait_time', 'whatsapp_msg_pending', 'whatsapp_msg_preparing', 'whatsapp_msg_ready_pickup', 'whatsapp_msg_ready_delivery', 'whatsapp_msg_delivered']);

              const customTemplates: Record<string, string> = {};
              settings?.forEach(s => {
                if (s.key === 'google_review_url' && s.value) googleReviewUrl = s.value;
                if (s.key === 'estimated_wait_time' && s.value) estimatedWaitTime = s.value;
                if (s.key?.startsWith('whatsapp_msg_') && s.value) customTemplates[s.key] = s.value;
              });

              // Determine delivery type from order notes (contains "Retirada" or "Entrega")
              const isPickup = order.notes?.includes('Retirada') || !order.deliveryAddress;
              
              const message = generateWhatsAppMessage({
                customerName: order.customerName,
                orderNumber: order.dailyNumber,
                orderCode: order.orderCode,
                status,
                storeName: companyData?.name || 'Estabelecimento',
                deliveryType: isPickup ? 'retirada' : 'entrega',
                storeAddress: companyData?.address || undefined,
                googleReviewUrl,
                estimatedTime: status === 'preparing' ? estimatedWaitTime : undefined,
                customTemplates: Object.keys(customTemplates).length > 0 ? customTemplates : undefined,
              });

              if (message) {
                await supabase.functions.invoke('whatsapp-evolution', {
                  body: {
                    action: 'send_message',
                    instanceName: instanceData.instance_name,
                    phone: order.customerPhone,
                    message,
                    companyId,
                    orderId,
                  },
                });
                toast.success('Notificação WhatsApp enviada!');
              }
            }
          }
        } catch (whatsappError) {
          console.error('WhatsApp notification failed:', whatsappError);
        }
      }

      return true;
    } catch (error) {
      console.error('Error updating order status:', error);
      toast.error('Erro ao atualizar status');
      return false;
    }
  }

  async function deleteOrder(orderId: string): Promise<boolean> {
    try {
      // Delete order items first
      const { error: itemsError } = await supabase
        .from('order_items')
        .delete()
        .eq('order_id', orderId);

      if (itemsError) throw itemsError;

      const { error: orderError } = await supabase
        .from('orders')
        .delete()
        .eq('id', orderId);

      if (orderError) throw orderError;

      await fetchOrders();
      return true;
    } catch (error) {
      console.error('Error deleting order:', error);
      toast.error('Erro ao excluir pedido');
      return false;
    }
  }

  function getOrdersByStatus(status: OrderStatus): Order[] {
    return orders.filter((order) => order.status === status);
  }

  function getTodayOrders(): Order[] {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return orders.filter((order) => {
      const orderDate = new Date(order.createdAt);
      orderDate.setHours(0, 0, 0, 0);
      return orderDate.getTime() === today.getTime();
    });
  }

  function getTodayRevenue(): number {
    const todayOrders = getTodayOrders();
    return todayOrders
      .filter((order) => order.status === 'delivered')
      .reduce((sum, order) => sum + order.total, 0);
  }

  return {
    orders,
    loading,
    addOrder,
    updateOrderStatus,
    deleteOrder,
    getOrdersByStatus,
    getTodayOrders,
    getTodayRevenue,
    refetch: fetchOrders,
  };
}
