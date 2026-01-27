import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Product, ProductOptional } from '@/types/product';
import { toast } from 'sonner';

interface UseProductsOptions {
  companyId?: string | null;
}

export function useProducts(options: UseProductsOptions = {}) {
  const { companyId } = options;
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  async function fetchProducts() {
    // Don't fetch if no companyId - prevents showing products from other companies
    if (!companyId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      let productsQuery = supabase
        .from('products')
        .select('*')
        .eq('company_id', companyId)
        .order('category', { ascending: true });

      const { data: productsData, error: productsError } = await productsQuery;

      if (productsError) throw productsError;

      // Get product IDs to fetch optionals
      const productIds = (productsData || []).map(p => p.id);
      
      let optionalsData: any[] = [];
      if (productIds.length > 0) {
        let optionalsQuery = supabase
          .from('product_optionals')
          .select('*')
          .in('product_id', productIds);

        const { data, error: optionalsError } = await optionalsQuery;

        if (optionalsError) throw optionalsError;
        optionalsData = data || [];
      }

      const mappedProducts: Product[] = (productsData || []).map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price),
        category: product.category,
        description: product.description || undefined,
        imageUrl: product.image_url || undefined,
        active: product.active,
        companyId: product.company_id || undefined,
        optionals: optionalsData
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
  }, [companyId]);

  async function addProduct(productData: Omit<Product, 'id' | 'optionals'>): Promise<string | null> {
    try {
      const { data, error } = await supabase
        .from('products')
        .insert({
          name: productData.name,
          price: productData.price,
          category: productData.category,
          description: productData.description || null,
          image_url: productData.imageUrl || null,
          active: productData.active,
          company_id: productData.companyId || companyId || null,
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
      const updateData: any = {};
      if (productData.name !== undefined) updateData.name = productData.name;
      if (productData.price !== undefined) updateData.price = productData.price;
      if (productData.category !== undefined) updateData.category = productData.category;
      if (productData.description !== undefined) updateData.description = productData.description || null;
      if (productData.imageUrl !== undefined) updateData.image_url = productData.imageUrl;
      if (productData.active !== undefined) updateData.active = productData.active;

      const { error } = await supabase
        .from('products')
        .update(updateData)
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

  async function addOptional(optionalData: Omit<ProductOptional, 'id'> & { companyId?: string }): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('product_optionals')
        .insert({
          product_id: optionalData.productId,
          name: optionalData.name,
          price: optionalData.price,
          type: optionalData.type,
          active: optionalData.active,
          company_id: optionalData.companyId || companyId || null,
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

  async function updateOptional(id: string, optionalData: Partial<ProductOptional>): Promise<boolean> {
    try {
      const updateData: any = {};
      if (optionalData.name !== undefined) updateData.name = optionalData.name;
      if (optionalData.price !== undefined) updateData.price = optionalData.price;
      if (optionalData.type !== undefined) updateData.type = optionalData.type;
      if (optionalData.active !== undefined) updateData.active = optionalData.active;

      const { error } = await supabase
        .from('product_optionals')
        .update(updateData)
        .eq('id', id);

      if (error) throw error;

      await fetchProducts();
      toast.success('Opcional atualizado!');
      return true;
    } catch (error) {
      console.error('Error updating optional:', error);
      toast.error('Erro ao atualizar opcional');
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
    updateOptional,
    deleteOptional,
    getActiveProducts,
    getCategories,
    refetch: fetchProducts,
  };
}
