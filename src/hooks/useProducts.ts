import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product, ProductOptional } from '@/types/product';
import { toast } from 'sonner';

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchProducts() {
    try {
      const { data: productsData, error: productsError } = await supabase
        .from('products')
        .select('*')
        .order('category', { ascending: true });

      if (productsError) throw productsError;

      const { data: optionalsData, error: optionalsError } = await supabase
        .from('product_optionals')
        .select('*');

      if (optionalsError) throw optionalsError;

      const mappedProducts: Product[] = (productsData || []).map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        category: product.category,
        description: product.description || undefined,
        active: product.active,
        optionals: (optionalsData || [])
          .filter((opt) => opt.product_id === product.id)
          .map((opt) => ({
            id: opt.id,
            productId: opt.product_id,
            name: opt.name,
            price: Number(opt.price),
            type: opt.type as 'extra' | 'variation',
            active: opt.active,
          })),
      }));

      setProducts(mappedProducts);
    } catch (error) {
      console.error('Error fetching products:', error);
      toast.error('Erro ao carregar produtos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchProducts();
  }, []);

  async function addProduct(productData: Omit<Product, 'id' | 'optionals'>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: productData.name,
          price: productData.price,
          category: productData.category,
          description: productData.description || null,
          active: productData.active,
        })
        .select()
        .single();

      if (error) throw error;

      await fetchProducts();
      toast.success('Produto criado!');
      return data.id;
    } catch (error) {
      console.error('Error adding product:', error);
      toast.error('Erro ao criar produto');
      return null;
    }
  }

  async function updateProduct(id: string, productData: Partial<Product>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('products')
        .update({
          name: productData.name,
          price: productData.price,
          category: productData.category,
          description: productData.description || null,
          active: productData.active,
        })
        .eq('id', id);

      if (error) throw error;

      await fetchProducts();
      toast.success('Produto atualizado!');
      return true;
    } catch (error) {
      console.error('Error updating product:', error);
      toast.error('Erro ao atualizar produto');
      return false;
    }
  }

  async function deleteProduct(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchProducts();
      toast.success('Produto excluído!');
      return true;
    } catch (error) {
      console.error('Error deleting product:', error);
      toast.error('Erro ao excluir produto');
      return false;
    }
  }

  async function addOptional(optionalData: Omit<ProductOptional, 'id'>): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('product_optionals')
        .insert({
          product_id: optionalData.productId,
          name: optionalData.name,
          price: optionalData.price,
          type: optionalData.type,
          active: optionalData.active,
        });

      if (error) throw error;

      await fetchProducts();
      toast.success('Opcional adicionado!');
      return true;
    } catch (error) {
      console.error('Error adding optional:', error);
      toast.error('Erro ao adicionar opcional');
      return false;
    }
  }

  async function deleteOptional(id: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('product_optionals')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await fetchProducts();
      toast.success('Opcional removido!');
      return true;
    } catch (error) {
      console.error('Error deleting optional:', error);
      toast.error('Erro ao remover opcional');
      return false;
    }
  }

  function getActiveProducts(): Product[] {
    return products.filter((p) => p.active);
  }

  function getCategories(): string[] {
    return [...new Set(products.map((p) => p.category))];
  }

  return {
    products,
    loading,
    addProduct,
    updateProduct,
    deleteProduct,
    addOptional,
    deleteOptional,
    getActiveProducts,
    getCategories,
    refetch: fetchProducts,
  };
}
