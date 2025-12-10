import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Category } from '@/types/order';
import { toast } from 'sonner';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchCategories() {
    try {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      const mapped: Category[] = (data || []).map((cat) => ({
        id: cat.id,
        name: cat.name,
        displayOrder: cat.display_order,
        active: cat.active,
      }));

      setCategories(mapped);
    } catch (error) {
      console.error('Error fetching categories:', error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchCategories();
  }, []);

  async function addCategory(name: string): Promise<boolean> {
    try {
      const maxOrder = categories.reduce((max, c) => Math.max(max, c.displayOrder), 0);
      
      const { error } = await supabase
        .from('categories')
        .insert({
          name,
          display_order: maxOrder + 1,
          active: true,
        });

      if (error) throw error;

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
      const { error } = await supabase
        .from('categories')
        .update({
          name: data.name,
          display_order: data.displayOrder,
          active: data.active,
        })
        .eq('id', id);

      if (error) throw error;

      await fetchCategories();
      toast.success('Categoria atualizada!');
      return true;
    } catch (error) {
      console.error('Error updating category:', error);
      toast.error('Erro ao atualizar categoria');
      return false;
    }
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
    categories,
    loading,
    addCategory,
    updateCategory,
    deleteCategory,
    refetch: fetchCategories,
  };
}
