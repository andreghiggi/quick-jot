import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Order, OrderItem, OrderStatus } from '@/types/order';
import { toast } from 'sonner';

interface UseOrdersOptions {
  companyId?: string | null;
}

export function useOrders(options: UseOrdersOptions = {}) {
  const { companyId } = options;
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchOrders() {
    try {
      let ordersQuery = supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });

      // Filter by company_id if provided
      if (companyId) {
        ordersQuery = ordersQuery.eq('company_id', companyId);
      }

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

      setOrders(mappedOrders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      toast.error('Erro ao carregar pedidos');
    } finally {
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
      .channel('orders-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders' },
        () => {
          fetchOrders();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_items' },
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

  async function addOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'dailyNumber'>): Promise<boolean> {
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

      // If status is 'ready', trigger WhatsApp notification
      if (status === 'ready') {
        const order = orders.find((o) => o.id === orderId);
        if (order?.customerPhone) {
          try {
            await supabase.functions.invoke('send-whatsapp', {
              body: {
                phone: order.customerPhone,
                customerName: order.customerName,
                orderId: orderId,
              },
            });
            toast.success('Notificação WhatsApp enviada!');
          } catch (whatsappError) {
            console.error('WhatsApp notification failed:', whatsappError);
          }
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
