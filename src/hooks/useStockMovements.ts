import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/**
 * Tipos de movimento de estoque (espelha CHECK constraint da tabela stock_movements).
 */
export type StockMovementType =
  | 'sale'
  | 'manual_in'
  | 'manual_out'
  | 'adjustment'
  | 'initial';

export interface StockMovement {
  id: string;
  company_id: string;
  product_id: string;
  type: StockMovementType;
  quantity: number;
  balance_after: number;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

interface UseStockMovementsOptions {
  companyId?: string | null;
  productId?: string | null;
}

/**
 * Hook utilitário para o módulo `mercado`. Apenas faz chamadas RPC/queries; não
 * tem efeito em lojas sem track_stock — a função SQL é no-op nesse caso.
 */
export function useStockMovements(options: UseStockMovementsOptions = {}) {
  const { companyId, productId } = options;
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMovements = useCallback(async () => {
    if (!companyId) {
      setMovements([]);
      return;
    }
    setLoading(true);
    try {
      let q = (supabase as any)
        .from('stock_movements')
        .select('*')
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
        .limit(200);
      if (productId) q = q.eq('product_id', productId);
      const { data, error } = await q;
      if (error) throw error;
      setMovements((data || []) as StockMovement[]);
    } catch (err) {
      console.error('Erro ao carregar movimentos de estoque:', err);
    } finally {
      setLoading(false);
    }
  }, [companyId, productId]);

  useEffect(() => {
    fetchMovements();
  }, [fetchMovements]);

  /**
   * Aplica um movimento de estoque. Quando o produto não tem track_stock,
   * a função SQL retorna NULL e o saldo não muda (no-op seguro).
   */
  async function applyMovement(params: {
    productId: string;
    quantity: number; // positivo = entrada, negativo = saída
    type: StockMovementType;
    referenceType?: string | null;
    referenceId?: string | null;
    notes?: string | null;
  }): Promise<number | null> {
    try {
      const { data, error } = await (supabase as any).rpc('apply_stock_movement', {
        _product_id: params.productId,
        _qty: params.quantity,
        _type: params.type,
        _reference_type: params.referenceType ?? null,
        _reference_id: params.referenceId ?? null,
        _notes: params.notes ?? null,
      });
      if (error) throw error;
      return data as number | null;
    } catch (err) {
      console.error('apply_stock_movement falhou:', err);
      return null;
    }
  }

  return { movements, loading, refetch: fetchMovements, applyMovement };
}

/**
 * Helper standalone (sem hook). Usado dentro de fluxos imperativos como o
 * checkout do Frente de Caixa, onde não queremos engatar lifecycle de React.
 */
export async function applyStockMovementOnce(params: {
  productId: string;
  quantity: number;
  type: StockMovementType;
  referenceType?: string | null;
  referenceId?: string | null;
  notes?: string | null;
}): Promise<number | null> {
  try {
    const { data, error } = await (supabase as any).rpc('apply_stock_movement', {
      _product_id: params.productId,
      _qty: params.quantity,
      _type: params.type,
      _reference_type: params.referenceType ?? null,
      _reference_id: params.referenceId ?? null,
      _notes: params.notes ?? null,
    });
    if (error) throw error;
    return data as number | null;
  } catch (err) {
    console.error('apply_stock_movement falhou:', err);
    return null;
  }
}