export interface ProductOptional {
  id: string;
  productId: string;
  name: string;
  price: number;
  type: 'extra' | 'variation';
  active: boolean;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  description?: string;
  imageUrl?: string;
  active: boolean;
  optionals?: ProductOptional[];
  companyId?: string;
  taxRuleId?: string | null;
  displayOrder?: number;
  pdvItem?: boolean;
  menuItem?: boolean;
  waiterItem?: boolean;
  isNew?: boolean;
  subcategoryId?: string | null;
  code?: string | null;
  gtin?: string | null;
  unit?: string;
  icmsOrigin?: string;
  netWeight?: number | null;
  grossWeight?: number | null;
  /** Custo unitário do produto (R$). Usado para cálculo de margem/CMV. */
  costPrice?: number | null;
  /** Editar Pedido (allow-list i9): item pode ser trocado em pedidos já enviados. */
  swappableInOrder?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedOptionals: ProductOptional[];
  groupedOptionalNames?: string[];
  notes?: string;
}
