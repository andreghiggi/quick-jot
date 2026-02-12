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
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedOptionals: ProductOptional[];
  notes?: string;
}
