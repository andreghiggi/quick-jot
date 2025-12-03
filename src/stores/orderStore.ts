import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Order, OrderStatus } from '@/types/order';

interface OrderStore {
  orders: Order[];
  addOrder: (order: Order) => void;
  updateOrderStatus: (orderId: string, status: OrderStatus) => void;
  deleteOrder: (orderId: string) => void;
  getOrdersByStatus: (status: OrderStatus) => Order[];
  getTodayOrders: () => Order[];
  getTodayRevenue: () => number;
}

export const useOrderStore = create<OrderStore>()(
  persist(
    (set, get) => ({
      orders: [],
      
      addOrder: (order) => set((state) => ({ 
        orders: [order, ...state.orders] 
      })),
      
      updateOrderStatus: (orderId, status) => set((state) => ({
        orders: state.orders.map((order) =>
          order.id === orderId ? { ...order, status } : order
        ),
      })),
      
      deleteOrder: (orderId) => set((state) => ({
        orders: state.orders.filter((order) => order.id !== orderId),
      })),
      
      getOrdersByStatus: (status) => {
        return get().orders.filter((order) => order.status === status);
      },
      
      getTodayOrders: () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        return get().orders.filter((order) => {
          const orderDate = new Date(order.createdAt);
          orderDate.setHours(0, 0, 0, 0);
          return orderDate.getTime() === today.getTime();
        });
      },
      
      getTodayRevenue: () => {
        const todayOrders = get().getTodayOrders();
        return todayOrders
          .filter((order) => order.status !== 'pending')
          .reduce((sum, order) => sum + order.total, 0);
      },
    }),
    {
      name: 'anota-ai-orders',
    }
  )
);
