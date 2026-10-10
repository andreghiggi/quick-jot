import { supabase } from '@/integrations/supabase/client';
import type { CartItem } from '@/types/product';

/**
 * Confere os preços do carrinho com o cadastro atual (produto, adicionais
 * simples e itens de grupos de adicionais). Retorna o carrinho atualizado e
 * se algum valor mudou. Falhas de rede retornam o carrinho original
 * (changed=false) para não travar o pedido.
 */
export async function refreshCartPrices(
  cart: CartItem[],
  companyId: string,
): Promise<{ cart: CartItem[]; changed: boolean }> {
  if (!cart.length || !companyId) return { cart, changed: false };

  const productIds = Array.from(new Set(cart.filter(i => !i.product.isCombo).map(i => i.product.id)));
  const optIds = Array.from(new Set(cart.flatMap(i => i.selectedOptionals.map(o => o.id)).filter(id => id && !id.includes(':'))));

  try {
    const [prodRes, optRes, grpRes] = await Promise.all([
      productIds.length
        ? supabase.from('products').select('id, price').eq('company_id', companyId).in('id', productIds)
        : Promise.resolve({ data: [], error: null } as any),
      optIds.length
        ? supabase.from('product_optionals').select('id, price').in('id', optIds)
        : Promise.resolve({ data: [], error: null } as any),
      optIds.length
        ? supabase.from('optional_group_items').select('id, price').in('id', optIds)
        : Promise.resolve({ data: [], error: null } as any),
    ]);
    if (prodRes.error || optRes.error || grpRes.error) return { cart, changed: false };

    const prodPrice = new Map<string, number>((prodRes.data || []).map((p: any) => [p.id, Number(p.price)]));
    const optPrice = new Map<string, number>();
    (optRes.data || []).forEach((o: any) => optPrice.set(o.id, Number(o.price)));
    (grpRes.data || []).forEach((o: any) => optPrice.set(o.id, Number(o.price)));

    let changed = false;
    const next = cart.map((item) => {
      let product = item.product;
      if (!product.isCombo && prodPrice.has(product.id)) {
        const p = prodPrice.get(product.id)!;
        if (Math.abs(p - product.price) > 0.001) { product = { ...product, price: p }; changed = true; }
      }
      let names = item.groupedOptionalNames ? [...item.groupedOptionalNames] : undefined;
      const selectedOptionals = item.selectedOptionals.map((o) => {
        if (!optPrice.has(o.id)) return o;
        const p = optPrice.get(o.id)!;
        if (Math.abs(p - o.price) < 0.001) return o;
        changed = true;
        if (names) {
          names = names.map(n => n.split(`${o.name} R$${o.price.toFixed(2)}`).join(p > 0 ? `${o.name} R$${p.toFixed(2)}` : o.name));
        }
        return { ...o, price: p };
      });
      return { ...item, product, selectedOptionals, groupedOptionalNames: names };
    });
    return { cart: changed ? next : cart, changed };
  } catch {
    return { cart, changed: false };
  }
}
