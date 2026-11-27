// Baixa de estoque dos pedidos — SOMENTE perfil floricultura.
// Converge pelo que já foi lançado para o pedido (reference_type + reference_id),
// então repetir a ação (duplo clique, recarregar, confirmar de novo) não baixa duas vezes,
// e cancelar/excluir devolve exatamente o que saiu.
import { supabase } from '@/integrations/supabase/client';

export const FLORIST_STOCK_KEY = 'florist_stock';
export const FLORIST_STOCK_REFERENCE = 'florist_order';

export interface FloristStockConfig {
  /** Pedidos confirmados (Catálogo) e criados no Balcão baixam o estoque. */
  deductOnOrders: boolean;
}
// Começa desligada: nada muda no estoque até a loja ligar nas Configurações.
export const DEFAULT_FLORIST_STOCK: FloristStockConfig = { deductOnOrders: false };

export function parseFloristStockConfig(value: unknown): FloristStockConfig {
  let raw: any = value;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_FLORIST_STOCK };
  return { deductOnOrders: raw.deductOnOrders === true };
}

export interface StockLine { productId?: string | null; quantity: number }
export interface AppliedMovement { product_id: string; quantity: number | string }
export interface StockAdjustment { productId: string; delta: number }

const round = (n: number) => Math.round(n * 1000) / 1000;

/**
 * Diferença entre o que o pedido deve ter baixado e o que já foi lançado.
 * active=false (cancelado, excluído ou baixa desligada) devolve tudo o que saiu.
 */
export function planStockAdjustments(items: StockLine[], applied: AppliedMovement[], active: boolean): StockAdjustment[] {
  const target = new Map<string, number>();
  if (active) {
    for (const item of items) {
      const qty = Number(item.quantity);
      if (!item.productId || !Number.isFinite(qty) || qty <= 0) continue;
      target.set(item.productId, (target.get(item.productId) || 0) - qty);
    }
  }
  const done = new Map<string, number>();
  for (const move of applied) {
    const qty = Number(move.quantity);
    if (!move.product_id || !Number.isFinite(qty)) continue;
    done.set(move.product_id, (done.get(move.product_id) || 0) + qty);
  }
  const result: StockAdjustment[] = [];
  for (const productId of new Set([...target.keys(), ...done.keys()])) {
    const delta = round((target.get(productId) || 0) - (done.get(productId) || 0));
    if (delta !== 0) result.push({ productId, delta });
  }
  return result;
}

export async function fetchFloristStockConfig(companyId: string): Promise<FloristStockConfig> {
  const { data, error } = await supabase.from('store_settings').select('value')
    .eq('company_id', companyId).eq('key', FLORIST_STOCK_KEY).maybeSingle();
  if (error) throw error;
  return parseFloristStockConfig(data?.value);
}

export async function saveFloristStockConfig(companyId: string, config: FloristStockConfig): Promise<FloristStockConfig> {
  const { data, error } = await supabase.from('store_settings').upsert({
    company_id: companyId, key: FLORIST_STOCK_KEY, value: JSON.stringify(config), updated_at: new Date().toISOString(),
  }, { onConflict: 'key,company_id' }).select('value').single();
  if (error || !data) throw error || new Error('Gravação não confirmada');
  return parseFloristStockConfig(data.value);
}

// Uma sincronização por pedido de cada vez nesta tela.
const inFlight = new Map<string, Promise<unknown>>();

export interface SyncResult { changed: number; failed: number }

/**
 * Ajusta o estoque de UM pedido floral. `active` = o pedido deve estar baixado agora.
 * Quando a baixa está desligada nas configurações, só devolve o que já tinha saído.
 */
export async function syncFloristOrderStock(params: {
  companyId: string; orderId: string; items: StockLine[]; active: boolean; label?: string;
}): Promise<SyncResult> {
  const previous = inFlight.get(params.orderId) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async (): Promise<SyncResult> => {
    let active = params.active;
    if (active) active = (await fetchFloristStockConfig(params.companyId)).deductOnOrders;
    const { data, error } = await (supabase as any).from('stock_movements')
      .select('product_id, quantity')
      .eq('company_id', params.companyId)
      .eq('reference_type', FLORIST_STOCK_REFERENCE)
      .eq('reference_id', params.orderId);
    if (error) throw error;
    const plan = planStockAdjustments(params.items, (data || []) as AppliedMovement[], active);
    let changed = 0; let failed = 0;
    for (const step of plan) {
      const { error: moveError } = await (supabase as any).rpc('apply_stock_movement', {
        _product_id: step.productId,
        _qty: step.delta,
        _type: step.delta < 0 ? 'sale' : 'manual_in',
        _reference_type: FLORIST_STOCK_REFERENCE,
        _reference_id: params.orderId,
        _notes: `${step.delta < 0 ? 'Pedido' : 'Estorno do pedido'} ${params.label || ''}`.trim(),
      });
      if (moveError) { failed += 1; console.error('[floristStock] movimento falhou', moveError); }
      else changed += 1;
    }
    return { changed, failed };
  });
  inFlight.set(params.orderId, run);
  try { return await run; }
  finally { if (inFlight.get(params.orderId) === run) inFlight.delete(params.orderId); }
}
