import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface ComboItem {
  id: string;
  combo_id: string;
  product_id: string;
  quantity: number;
  display_order: number;
}

export interface Combo {
  id: string;
  company_id: string;
  name: string;
  code: string | null;
  gtin: string | null;
  description: string | null;
  image_url: string | null;
  price: number;
  active: boolean;
  display_order: number;
  pdv_item: boolean;
  menu_item: boolean;
  waiter_item: boolean;
  fiscal_mode: 'explodido' | 'kit_comercial';
  ncm: string | null;
  cfop: string | null;
  cest: string | null;
  tax_rule_id: string | null;
  items: ComboItem[];
  category_ids: string[];
}

export type ComboInput = Partial<Omit<Combo, 'id' | 'company_id' | 'items' | 'category_ids'>>;

interface UseCombosOptions {
  companyId?: string | null;
}

export function useCombos({ companyId }: UseCombosOptions = {}) {
  const [combos, setCombos] = useState<Combo[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCombos = useCallback(async () => {
    if (!companyId) {
      setCombos([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data: cData, error: cErr } = await supabase
        .from('combos' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (cErr) throw cErr;

      const ids = (cData || []).map((c: any) => c.id);
      let items: any[] = [];
      let cats: any[] = [];
      if (ids.length) {
        const [{ data: iData }, { data: catData }] = await Promise.all([
          supabase.from('combo_items' as any).select('*').in('combo_id', ids).order('display_order'),
          supabase.from('combo_categories' as any).select('*').in('combo_id', ids),
        ]);
        items = iData || [];
        cats = catData || [];
      }

      const mapped: Combo[] = (cData || []).map((c: any) => ({
        id: c.id,
        company_id: c.company_id,
        name: c.name,
        code: c.code,
        gtin: c.gtin,
        description: c.description,
        image_url: c.image_url,
        price: Number(c.price),
        active: c.active,
        display_order: c.display_order ?? 0,
        pdv_item: c.pdv_item ?? true,
        menu_item: c.menu_item ?? true,
        waiter_item: c.waiter_item ?? true,
        fiscal_mode: (c.fiscal_mode as any) ?? 'explodido',
        ncm: c.ncm,
        cfop: c.cfop,
        cest: c.cest,
        tax_rule_id: c.tax_rule_id,
        items: items
          .filter((it) => it.combo_id === c.id)
          .map((it) => ({
            id: it.id,
            combo_id: it.combo_id,
            product_id: it.product_id,
            quantity: Number(it.quantity),
            display_order: it.display_order ?? 0,
          })),
        category_ids: cats.filter((x) => x.combo_id === c.id).map((x) => x.category_id),
      }));
      setCombos(mapped);
    } catch (e) {
      console.error('Erro ao carregar combos:', e);
      toast.error('Erro ao carregar combos');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchCombos();
  }, [fetchCombos]);

  async function saveCombo(
    combo: ComboInput & { id?: string },
    items: Array<{ product_id: string; quantity: number }>,
    categoryIds: string[]
  ): Promise<boolean> {
    if (!companyId) return false;
    try {
      let comboId = combo.id;
      const payload: any = {
        company_id: companyId,
        name: combo.name,
        code: combo.code || null,
        gtin: combo.gtin || null,
        description: combo.description || null,
        image_url: combo.image_url || null,
        price: combo.price ?? 0,
        active: combo.active ?? true,
        display_order: combo.display_order ?? 0,
        pdv_item: combo.pdv_item ?? true,
        menu_item: combo.menu_item ?? true,
        waiter_item: combo.waiter_item ?? true,
        fiscal_mode: combo.fiscal_mode ?? 'explodido',
        ncm: combo.ncm || null,
        cfop: combo.cfop || null,
        cest: combo.cest || null,
        tax_rule_id: combo.tax_rule_id || null,
      };

      if (comboId) {
        const { error } = await supabase.from('combos' as any).update(payload).eq('id', comboId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('combos' as any).insert(payload).select('id').single();
        if (error) throw error;
        comboId = (data as any).id;
      }

      // Reset items
      await supabase.from('combo_items' as any).delete().eq('combo_id', comboId);
      if (items.length) {
        const rows = items.map((it, idx) => ({
          combo_id: comboId,
          product_id: it.product_id,
          quantity: it.quantity,
          display_order: idx,
        }));
        const { error } = await supabase.from('combo_items' as any).insert(rows);
        if (error) throw error;
      }

      // Reset categories
      await supabase.from('combo_categories' as any).delete().eq('combo_id', comboId);
      if (categoryIds.length) {
        const rows = categoryIds.map((cid) => ({ combo_id: comboId, category_id: cid }));
        const { error } = await supabase.from('combo_categories' as any).insert(rows);
        if (error) throw error;
      }

      await fetchCombos();
      toast.success(combo.id ? 'Combo atualizado!' : 'Combo criado!');
      return true;
    } catch (e: any) {
      console.error('Erro ao salvar combo:', e);
      toast.error('Erro ao salvar combo: ' + (e?.message || ''));
      return false;
    }
  }

  async function deleteCombo(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('combos' as any).delete().eq('id', id);
      if (error) throw error;
      await fetchCombos();
      toast.success('Combo excluído!');
      return true;
    } catch (e) {
      console.error(e);
      toast.error('Erro ao excluir combo');
      return false;
    }
  }

  async function toggleActive(id: string, active: boolean) {
    try {
      const { error } = await supabase.from('combos' as any).update({ active }).eq('id', id);
      if (error) throw error;
      await fetchCombos();
    } catch (e) {
      toast.error('Erro ao atualizar');
    }
  }

  async function moveCombo(id: string, direction: 'up' | 'down') {
    const idx = combos.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= combos.length) return;
    const newList = [...combos];
    [newList[idx], newList[swapIdx]] = [newList[swapIdx], newList[idx]];
    setCombos(newList.map((c, i) => ({ ...c, display_order: i })));
    try {
      // Normaliza display_order de todos para garantir ordenação consistente
      await Promise.all(
        newList.map((c, i) =>
          supabase.from('combos' as any).update({ display_order: i }).eq('id', c.id)
        )
      );
      await fetchCombos();
    } catch (e) {
      toast.error('Erro ao reordenar combos');
      await fetchCombos();
    }
  }

  return { combos, loading, refetch: fetchCombos, saveCombo, deleteCombo, toggleActive, moveCombo };
}