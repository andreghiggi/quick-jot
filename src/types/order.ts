export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'delivered';

export interface OrderItem {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  price: number;
  notes?: string;
}

export interface Order {
  id: string;
  customerName: string;
  customerPhone?: string;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  createdAt: Date;
  deliveryAddress?: string;
  notes?: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string;
}
