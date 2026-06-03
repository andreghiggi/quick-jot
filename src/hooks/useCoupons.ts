import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export type CouponDiscountType = 'percent' | 'fixed';

export interface Coupon {
  id: string;
  company_id: string;
  code: string;
  discount_type: CouponDiscountType;
  discount_value: number;
  min_order_value: number | null;
  max_discount: number | null;
  is_secret: boolean;
  active: boolean;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit: number | null;
  usage_count: number;
  created_at: string;
  updated_at: string;
}

export type CouponInput = Omit<Coupon, 'id' | 'company_id' | 'usage_count' | 'created_at' | 'updated_at'>;

export function useCoupons(companyId: string | null | undefined) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCoupons = useCallback(async () => {
    if (!companyId) {
      setCoupons([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from('coupons')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Erro ao carregar cupons:', error);
      toast.error('Erro ao carregar cupons');
    } else {
      setCoupons((data || []) as Coupon[]);
    }
    setLoading(false);
  }, [companyId]);

  useEffect(() => { fetchCoupons(); }, [fetchCoupons]);

  const createCoupon = async (input: CouponInput) => {
    if (!companyId) return false;
    const { error } = await supabase
      .from('coupons')
      .insert({ ...input, code: input.code.toUpperCase(), company_id: companyId });
    if (error) {
      if (error.code === '23505') toast.error('Já existe um cupom com esse código');
      else toast.error('Erro ao criar cupom');
      return false;
    }
    toast.success('Cupom criado');
    await fetchCoupons();
    return true;
  };

  const updateCoupon = async (id: string, input: Partial<CouponInput>) => {
    const payload: Record<string, unknown> = { ...input };
    if (typeof input.code === 'string') payload.code = input.code.toUpperCase();
    const { error } = await supabase.from('coupons').update(payload).eq('id', id);
    if (error) {
      if (error.code === '23505') toast.error('Já existe um cupom com esse código');
      else toast.error('Erro ao atualizar cupom');
      return false;
    }
    toast.success('Cupom atualizado');
    await fetchCoupons();
    return true;
  };

  const deleteCoupon = async (id: string) => {
    const { error } = await supabase.from('coupons').delete().eq('id', id);
    if (error) {
      toast.error('Erro ao excluir cupom');
      return false;
    }
    toast.success('Cupom excluído');
    await fetchCoupons();
    return true;
  };

  return { coupons, loading, createCoupon, updateCoupon, deleteCoupon, refetch: fetchCoupons };
}

// ----- Helpers de aplicação (compartilhados entre admin/menu) -----

export function isCouponCurrentlyValid(c: Pick<Coupon, 'active' | 'valid_from' | 'valid_until' | 'usage_limit' | 'usage_count'>): boolean {
  if (!c.active) return false;
  const now = Date.now();
  if (c.valid_from && new Date(c.valid_from).getTime() > now) return false;
  if (c.valid_until && new Date(c.valid_until).getTime() < now) return false;
  if (c.usage_limit != null && c.usage_count >= c.usage_limit) return false;
  return true;
}

export interface AppliedCouponResult {
  discountAmount: number;
  eligible: boolean;
  reason?: string;
}

export function computeCouponDiscount(
  coupon: Pick<Coupon, 'discount_type' | 'discount_value' | 'min_order_value' | 'max_discount' | 'active' | 'valid_from' | 'valid_until' | 'usage_limit' | 'usage_count'>,
  subtotal: number,
): AppliedCouponResult {
  if (!isCouponCurrentlyValid(coupon)) {
    return { discountAmount: 0, eligible: false, reason: 'Cupom indisponível' };
  }
  if (coupon.min_order_value && subtotal < coupon.min_order_value) {
    return {
      discountAmount: 0,
      eligible: false,
      reason: `Pedido mínimo de R$ ${coupon.min_order_value.toFixed(2).replace('.', ',')}`,
    };
  }
  let discount = 0;
  if (coupon.discount_type === 'percent') {
    discount = (subtotal * coupon.discount_value) / 100;
    if (coupon.max_discount && discount > coupon.max_discount) discount = coupon.max_discount;
  } else {
    discount = coupon.discount_value;
  }
  if (discount > subtotal) discount = subtotal;
  if (discount < 0) discount = 0;
  return { discountAmount: discount, eligible: true };
}