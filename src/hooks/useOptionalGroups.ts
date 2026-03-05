import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface OptionalGroupItem {
  id: string;
  groupId: string;
  name: string;
  price: number;
  active: boolean;
  displayOrder: number;
  imageUrl?: string | null;
}

export interface OptionalGroup {
  id: string;
  companyId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  active: boolean;
  displayOrder: number;
  items: OptionalGroupItem[];
  categoryIds: string[];
  productIds: string[];
}

interface UseOptionalGroupsOptions {
  companyId?: string | null;
}

export function useOptionalGroups({ companyId }: UseOptionalGroupsOptions = {}) {
  const [groups, setGroups] = useState<OptionalGroup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!companyId) {
      setGroups([]);
      setLoading(false);
      return;
    }

    try {
      const [groupsRes, itemsRes, catLinksRes, prodLinksRes] = await Promise.all([
        supabase.from('optional_groups').select('*').eq('company_id', companyId).order('display_order'),
        supabase.from('optional_group_items').select('*').eq('company_id', companyId).order('display_order'),
        supabase.from('optional_group_categories').select('*'),
        supabase.from('optional_group_products').select('*'),
      ]);

      if (groupsRes.error) throw groupsRes.error;

      const items = itemsRes.data || [];
      const catLinks = catLinksRes.data || [];
      const prodLinks = prodLinksRes.data || [];

      const groupIds = (groupsRes.data || []).map(g => g.id);

      const mapped: OptionalGroup[] = (groupsRes.data || []).map(g => ({
        id: g.id,
        companyId: g.company_id,
        name: g.name,
        minSelect: g.min_select,
        maxSelect: g.max_select,
        active: g.active,
        displayOrder: g.display_order ?? 0,
        items: items
          .filter(i => i.group_id === g.id)
          .map(i => ({
            id: i.id,
            groupId: i.group_id,
            name: i.name,
            price: Number(i.price),
            active: i.active,
            displayOrder: i.display_order ?? 0,
            imageUrl: (i as any).image_url ?? null,
          }))
          .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
        categoryIds: catLinks.filter(c => c.group_id === g.id).map(c => c.category_id),
        productIds: prodLinks.filter(p => p.group_id === g.id).map(p => p.product_id),
      }));

      setGroups(mapped);
    } catch (error) {
      console.error('Error fetching optional groups:', error);
      toast.error('Erro ao carregar grupos de adicionais');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  async function addGroup(data: { name: string; minSelect: number; maxSelect: number }): Promise<string | null> {
    if (!companyId) return null;
    try {
      const { data: row, error } = await supabase
        .from('optional_groups')
        .insert({ company_id: companyId, name: data.name, min_select: data.minSelect, max_select: data.maxSelect })
        .select()
        .single();
      if (error) throw error;
      await fetchGroups();
      toast.success('Grupo criado!');
      return row.id;
    } catch (error) {
      console.error('Error adding group:', error);
      toast.error('Erro ao criar grupo');
      return null;
    }
  }

  async function updateGroup(id: string, data: Partial<{ name: string; minSelect: number; maxSelect: number; active: boolean }>): Promise<boolean> {
    try {
      const update: any = {};
      if (data.name !== undefined) update.name = data.name;
      if (data.minSelect !== undefined) update.min_select = data.minSelect;
      if (data.maxSelect !== undefined) update.max_select = data.maxSelect;
      if (data.active !== undefined) update.active = data.active;

      const { error } = await supabase.from('optional_groups').update(update).eq('id', id);
      if (error) throw error;
      await fetchGroups();
      toast.success('Grupo atualizado!');
      return true;
    } catch (error) {
      console.error('Error updating group:', error);
      toast.error('Erro ao atualizar grupo');
      return false;
    }
  }

  async function deleteGroup(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('optional_groups').delete().eq('id', id);
      if (error) throw error;
      await fetchGroups();
      toast.success('Grupo excluído!');
      return true;
    } catch (error) {
      console.error('Error deleting group:', error);
      toast.error('Erro ao excluir grupo');
      return false;
    }
  }

  async function addItem(groupId: string, data: { name: string; price: number }): Promise<boolean> {
    if (!companyId) return false;
    try {
      const { error } = await supabase
        .from('optional_group_items')
        .insert({ group_id: groupId, company_id: companyId, name: data.name, price: data.price });
      if (error) throw error;
      await fetchGroups();
      toast.success('Item adicionado!');
      return true;
    } catch (error) {
      console.error('Error adding item:', error);
      toast.error('Erro ao adicionar item');
      return false;
    }
  }

  async function addItemsBulk(groupId: string, items: { name: string; price: number }[]): Promise<boolean> {
    if (!companyId || items.length === 0) return false;
    try {
      const rows = items.map(i => ({ group_id: groupId, company_id: companyId, name: i.name, price: i.price }));
      const { error } = await supabase.from('optional_group_items').insert(rows);
      if (error) throw error;
      await fetchGroups();
      toast.success(`${items.length} itens adicionados!`);
      return true;
    } catch (error) {
      console.error('Error adding items:', error);
      toast.error('Erro ao adicionar itens');
      return false;
    }
  }

  async function updateItem(id: string, data: Partial<{ name: string; price: number; active: boolean; image_url: string | null }>): Promise<boolean> {
    try {
      const { error } = await supabase.from('optional_group_items').update(data as any).eq('id', id);
      if (error) throw error;
      await fetchGroups();
      return true;
    } catch (error) {
      console.error('Error updating item:', error);
      toast.error('Erro ao atualizar item');
      return false;
    }
  }

  async function deleteItem(id: string): Promise<boolean> {
    try {
      const { error } = await supabase.from('optional_group_items').delete().eq('id', id);
      if (error) throw error;
      await fetchGroups();
      toast.success('Item removido!');
      return true;
    } catch (error) {
      console.error('Error deleting item:', error);
      toast.error('Erro ao remover item');
      return false;
    }
  }

  async function setCategoryLinks(groupId: string, categoryIds: string[]): Promise<boolean> {
    try {
      // Delete existing
      await supabase.from('optional_group_categories').delete().eq('group_id', groupId);
      // Insert new
      if (categoryIds.length > 0) {
        const rows = categoryIds.map(cid => ({ group_id: groupId, category_id: cid }));
        const { error } = await supabase.from('optional_group_categories').insert(rows);
        if (error) throw error;
      }
      await fetchGroups();
      return true;
    } catch (error) {
      console.error('Error setting category links:', error);
      toast.error('Erro ao associar categorias');
      return false;
    }
  }

  async function setProductLinks(groupId: string, productIds: string[]): Promise<boolean> {
    try {
      await supabase.from('optional_group_products').delete().eq('group_id', groupId);
      if (productIds.length > 0) {
        const rows = productIds.map(pid => ({ group_id: groupId, product_id: pid }));
        const { error } = await supabase.from('optional_group_products').insert(rows);
        if (error) throw error;
      }
      await fetchGroups();
      return true;
    } catch (error) {
      console.error('Error setting product links:', error);
      toast.error('Erro ao associar produtos');
      return false;
    }
  }

  /** Get groups applicable to a specific product (by direct link or category link) */
  function getGroupsForProduct(productId: string, productCategory: string, categoryIdByName: Record<string, string>): OptionalGroup[] {
    const catId = categoryIdByName[productCategory];
    return groups.filter(g => {
      if (!g.active) return false;
      // Direct product link
      if (g.productIds.includes(productId)) return true;
      // Category link
      if (catId && g.categoryIds.includes(catId)) return true;
      return false;
    });
  }

  return {
    groups,
    loading,
    addGroup,
    updateGroup,
    deleteGroup,
    addItem,
    addItemsBulk,
    updateItem,
    deleteItem,
    setCategoryLinks,
    setProductLinks,
    getGroupsForProduct,
    refetch: fetchGroups,
  };
}
