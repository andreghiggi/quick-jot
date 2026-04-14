import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface Subcategory {
  id: string;
  companyId: string;
  categoryId: string;
  name: string;
  imageUrl?: string;
  active: boolean;
  displayOrder: number;
}

interface UseSubcategoriesOptions {
  companyId?: string | null;
}

export function useSubcategories(options: UseSubcategoriesOptions = {}) {
  const { companyId } = options;
  const [subcategories, setSubcategories] = useState<Subcategory[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchSubcategories() {
    if (!companyId) {
      setSubcategories([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('subcategories')
        .select('*')
        .eq('company_id', companyId)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const mapped: Subcategory[] = (data || []).map((s: any) => ({
        id: s.id,
        companyId: s.company_id,
        categoryId: s.category_id,
        name: s.name,
        imageUrl: s.image_url || undefined,
        active: s.active,
        displayOrder: s.display_order ?? 0,
      }));

      setSubcategories(mapped);
    } catch (error) {
      console.error('Error fetching subcategories:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSubcategories();
  }, [companyId]);

  function getSubcategoriesByCategoryId(categoryId: string): Subcategory[] {
    return subcategories.filter(s => s.categoryId === categoryId && s.active);
  }

  async function addSubcategory(categoryId: string, name: string, imageUrl?: string): Promise<boolean> {
    if (!companyId) return false;
    try {
      const maxOrder = subcategories
        .filter(s => s.categoryId === categoryId)
        .reduce((max, s) => Math.max(max, s.displayOrder), 0);

      const { error } = await supabase
        .from('subcategories')
        .insert({
          company_id: companyId,
          category_id: categoryId,
          name,
          image_url: imageUrl || null,
          display_order: maxOrder + 1,
        });

      if (error) throw error;
      await fetchSubcategories();
      toast.success('Subcategoria criada!');
      return true;
    } catch (error) {
      console.error('Error adding subcategory:', error);
      toast.error('Erro ao criar subcategoria');
      return false;
    }
  }

  async function updateSubcategory(id: string, data: Partial<Pick<Subcategory, 'name' | 'imageUrl' | 'active' | 'displayOrder'>>): Promise<boolean> {
    try {
      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl;
      if (data.active !== undefined) updateData.active = data.active;
      if (data.displayOrder !== undefined) updateData.display_order = data.displayOrder;

      const { error } = await supabase
        .from('subcategories')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;
      await fetchSubcategories();
      toast.success('Subcategoria atualizada!');
      return true;
    } catch (error) {
      console.error('Error updating subcategory:', error);
      toast.error('Erro ao atualizar subcategoria');
      return false;
    }
  }

  async function deleteSubcategory(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('subcategories')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await fetchSubcategories();
      toast.success('Subcategoria removida!');
      return true;
    } catch (error) {
      console.error('Error deleting subcategory:', error);
      toast.error('Erro ao remover subcategoria');
      return false;
    }
  }

  async function moveSubcategory(id: string, direction: 'up' | 'down', categoryId: string): Promise<boolean> {
    const catSubs = subcategories
      .filter(s => s.categoryId === categoryId)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    const idx = catSubs.findIndex(s => s.id === id);
    if (idx === -1) return false;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= catSubs.length) return false;

    try {
      await Promise.all([
        supabase.from('subcategories').update({ display_order: catSubs[swapIdx].displayOrder }).eq('id', catSubs[idx].id),
        supabase.from('subcategories').update({ display_order: catSubs[idx].displayOrder }).eq('id', catSubs[swapIdx].id),
      ]);
      await fetchSubcategories();
      return true;
    } catch (error) {
      console.error('Error moving subcategory:', error);
      return false;
    }
  }

  return {
    subcategories,
    loading,
    getSubcategoriesByCategoryId,
    addSubcategory,
    updateSubcategory,
    deleteSubcategory,
    moveSubcategory,
    refetch: fetchSubcategories,
  };
}
