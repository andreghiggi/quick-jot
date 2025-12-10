import { createContext, useContext, ReactNode } from 'react';
import { useOrders } from '@/hooks/useOrders';
import { Order, OrderStatus } from '@/types/order';

interface OrderContextType {
  orders: Order[];
  loading: boolean;
  addOrder: (orderData: Omit<Order, 'id' | 'createdAt' | 'dailyNumber'>) => Promise<boolean>;
  updateOrderStatus: (orderId: string, status: OrderStatus) => Promise<boolean>;
  deleteOrder: (orderId: string) => Promise<boolean>;
  getOrdersByStatus: (status: OrderStatus) => Order[];
  getTodayOrders: () => Order[];
  getTodayRevenue: () => number;
  refetch: () => Promise<void>;
}

const OrderContext = createContext<OrderContextType | undefined>(undefined);

export function OrderProvider({ children }: { children: ReactNode }) {
  const ordersData = useOrders();

  return (
    <OrderContext.Provider value={ordersData}>
      {children}
    </OrderContext.Provider>
  );
}

export function useOrderContext() {
  const context = useContext(OrderContext);
  if (context === undefined) {
    throw new Error('useOrderContext must be used within an OrderProvider');
  }
  return context;
}
