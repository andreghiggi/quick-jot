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
  /**
   * Tipo do produto. Define onde ele aparece por padrão e como o formulário se comporta.
   * - `cardapio`: prato/lanche (categoria obrigatória, sem foco em estoque/GTIN).
   * - `mercado`: item de conveniência (categoria opcional, foco em GTIN/estoque/unidade).
   * - `ambos`: aparece em cardápio + caixa/mercado.
   * Compatibilidade: lojas existentes continuam funcionando — esse campo só ajusta UX.
   */
  productType?: 'cardapio' | 'mercado' | 'ambos';
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
  /** Controle de estoque (módulo `mercado`). Quando false, vendas não fazem baixa. */
  trackStock?: boolean;
  /** Saldo atual em estoque. Atualizado pela função apply_stock_movement. */
  stockQuantity?: number;
  /** Estoque mínimo (alerta). */
  minStock?: number;
  // ---- Fiscal (Fase C) ----
  ncm?: string | null;
  cest?: string | null;
  cfop?: string | null;
  // ---- Comercial / atacado ----
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  brand?: string | null;
  supplierId?: string | null;
  // ---- Validade / lote ----
  shelfLifeDays?: number | null;
  expirationDate?: string | null; // ISO date (yyyy-mm-dd)
  batchNumber?: string | null;
  // ---- Balança ----
  isScaleItem?: boolean;
  scaleBarcode?: string | null;
  pricePerKg?: boolean;
  /** Vender por peso no Frente de Caixa: ao adicionar, abre modal para informar peso (KG/G). */
  sellByWeight?: boolean;
  /** Combo virtual exibido no cardápio. id no formato `combo:<uuid>`; em order_items, salvar product_id=null. */
  isCombo?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  selectedOptionals: ProductOptional[];
  groupedOptionalNames?: string[];
  notes?: string;
}
