import { useState, useEffect, useMemo } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category } from '@/types/order';
import { toast } from 'sonner';

export type CategorySortMode = 'manual' | 'alphabetical' | 'created';

interface UseCategoriesOptions {
  companyId?: string | null;
}

export function useCategories(options: UseCategoriesOptions = {}) {
  const { companyId } = options;
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortMode, setSortMode] = useState<CategorySortMode>('manual');

  async function fetchCategories() {
    // Don't fetch if no companyId - prevents showing categories from other companies
    if (!companyId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('company_id', companyId)
        .eq('active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const mapped: Category[] = (data || []).map((cat) => ({
        id: cat.id,
        name: cat.name,
        displayOrder: cat.display_order ?? 0,
        active: cat.active ?? true,
        companyId: cat.company_id || undefined,
        emoji: cat.emoji || undefined,
        imageUrl: cat.image_url || undefined,
        animated: (cat as any).animated ?? false,
        menuItem: (cat as any).menu_item ?? true,
        pdvItem: (cat as any).pdv_item ?? true,
      }));

      setCategories(mapped);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  }

  // Load sort mode from store_settings
  useEffect(() => {
    async function loadSortMode() {
      if (!companyId) return;
      try {
        const { data } = await supabase
          .from('store_settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'category_sort_mode')
          .maybeSingle();
        
        if (data?.value) {
          setSortMode(data.value as CategorySortMode);
        }
      } catch (error) {
        console.error('Error loading sort mode:', error);
      }
    }
    loadSortMode();
  }, [companyId]);

  useEffect(() => {
    fetchCategories();
  }, [companyId]);

  // Sorted categories based on current sort mode
  const sortedCategories = useMemo(() => {
    const sorted = [...categories];
    switch (sortMode) {
      case 'alphabetical':
        return sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
      case 'created':
        return sorted.sort((a, b) => a.displayOrder - b.displayOrder);
      case 'manual':
      default:
        return sorted.sort((a, b) => a.displayOrder - b.displayOrder);
    }
  }, [categories, sortMode]);

  async function saveSortMode(mode: CategorySortMode): Promise<boolean> {
    if (!companyId) return false;
    try {
      // Check if setting exists
      const { data: existing } = await supabase
        .from('store_settings')
        .select('id')
        .eq('company_id', companyId)
        .eq('key', 'category_sort_mode')
        .maybeSingle();

      if (existing) {
        await supabase
          .from('store_settings')
          .update({ value: mode })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('store_settings')
          .insert({ company_id: companyId, key: 'category_sort_mode', value: mode });
      }

      setSortMode(mode);
      toast.success('Modo de ordenação salvo!');
      return true;
    } catch (error) {
      console.error('Error saving sort mode:', error);
      toast.error('Erro ao salvar ordenação');
      return false;
    }
  }

  async function addCategory(name: string): Promise<boolean> {
    if (!companyId) {
      toast.error('Empresa não identificada');
      return false;
    }
    
    try {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.displayOrder), 0);
      
      const { error } = await supabase
        .from('categories')
        .insert({
          name,
          display_order: maxOrder + 1,
          active: true,
          company_id: companyId,
        });

      if (error) {
        if (error.code === '23505') {
          toast.error('Já existe uma categoria com esse nome');
          return false;
        }
        throw error;
      }

      await fetchCategories();
      toast.success('Categoria criada!');
      return true;
    } catch (error) {
      console.error('Error adding category:', error);
      toast.error('Erro ao criar categoria');
      return false;
    }
  }

  async function updateCategory(id: string, data: Partial<Category>): Promise<boolean> {
    try {
      // If renaming, get old name first to update products
      let oldName: string | null = null;
      if (data.name !== undefined) {
        const existing = categories.find(c => c.id === id);
        if (existing && existing.name !== data.name) {
          oldName = existing.name;
        }
      }

      const updateData: Record<string, unknown> = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.displayOrder !== undefined) updateData.display_order = data.displayOrder;
      if (data.active !== undefined) updateData.active = data.active;
      if (data.emoji !== undefined) updateData.emoji = data.emoji;
      if (data.imageUrl !== undefined) updateData.image_url = data.imageUrl;
      if (data.animated !== undefined) updateData.animated = data.animated;
      if (data.menuItem !== undefined) updateData.menu_item = data.menuItem;
      if (data.pdvItem !== undefined) updateData.pdv_item = data.pdvItem;

      const { error } = await supabase
        .from('categories')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      // If category was renamed, update all products referencing the old name
      if (oldName && data.name && companyId) {
        const { error: productsError } = await supabase
          .from('products')
          .update({ category: data.name })
          .eq('category', oldName)
          .eq('company_id', companyId);

        if (productsError) {
          console.error('Error updating products category:', productsError);
          toast.error('Categoria renomeada, mas erro ao atualizar produtos');
        }
      }

      await fetchCategories();
      toast.success('Categoria atualizada!');
      return true;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Erro ao atualizar categoria');
      return false;
    }
  }

  async function reorderCategories(reorderedCategories: Category[]): Promise<boolean> {
    try {
      // Update display_order for each category
      const updates = reorderedCategories.map((cat, index) => 
        supabase
          .from('categories')
          .update({ display_order: index })
          .eq('id', cat.id)
      );

      await Promise.all(updates);
      
      // Refetch to get updated data from database
      await fetchCategories();
      
      toast.success('Ordem atualizada!');
      return true;
    } catch (error) {
      console.error('Error reordering categories:', error);
      toast.error('Erro ao reordenar categorias');
      return false;
    }
  }

  async function moveCategory(id: string, direction: 'up' | 'down'): Promise<boolean> {
    // Work with the base categories array sorted by displayOrder for consistent reordering
    const workingList = [...categories].sort((a, b) => a.displayOrder - b.displayOrder);
    const currentIndex = workingList.findIndex(c => c.id === id);
    if (currentIndex === -1) return false;
    
    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= workingList.length) return false;
    
    const newOrder = [...workingList];
    const [removed] = newOrder.splice(currentIndex, 1);
    newOrder.splice(newIndex, 0, removed);
    
    return reorderCategories(newOrder);
  }

  async function deleteCategory(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('categories')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchCategories();
      toast.success('Categoria removida!');
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      toast.error('Erro ao remover categoria');
      return false;
    }
  }

  return {
    categories: sortedCategories,
    loading,
    sortMode,
    saveSortMode,
    addCategory,
    updateCategory,
    deleteCategory,
    reorderCategories,
    moveCategory,
    refetch: fetchCategories,
  };
}
