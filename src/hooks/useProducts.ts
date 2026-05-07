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
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: true });

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
        taxRuleId: product.tax_rule_id || null,
        displayOrder: product.display_order ?? 0,
        pdvItem: product.pdv_item ?? true,
        menuItem: (product as any).menu_item ?? true,
        waiterItem: (product as any).waiter_item ?? true,
        isNew: (product as any).is_new ?? false,
        subcategoryId: (product as any).subcategory_id || null,
        code: (product as any).code || null,
        gtin: (product as any).gtin || null,
        unit: (product as any).unit || 'UN',
        icmsOrigin: (product as any).icms_origin || '0',
        netWeight: (product as any).net_weight != null ? Number((product as any).net_weight) : null,
        grossWeight: (product as any).gross_weight != null ? Number((product as any).gross_weight) : null,
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
          subcategory_id: (productData as any).subcategoryId || null,
          pdv_item: productData.pdvItem ?? true,
          menu_item: productData.menuItem ?? true,
        } as any)
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
      if (productData.pdvItem !== undefined) updateData.pdv_item = productData.pdvItem;
      if (productData.menuItem !== undefined) (updateData as any).menu_item = productData.menuItem;
      if (productData.waiterItem !== undefined) (updateData as any).waiter_item = productData.waiterItem;
      if (productData.subcategoryId !== undefined) updateData.subcategory_id = productData.subcategoryId || null;
      if ((productData as any).code !== undefined) (updateData as any).code = (productData as any).code || null;
      if ((productData as any).gtin !== undefined) (updateData as any).gtin = (productData as any).gtin || null;
      if ((productData as any).unit !== undefined) (updateData as any).unit = (productData as any).unit || 'UN';
      if ((productData as any).icmsOrigin !== undefined) (updateData as any).icms_origin = (productData as any).icmsOrigin || '0';
      if ((productData as any).netWeight !== undefined) (updateData as any).net_weight = (productData as any).netWeight;
      if ((productData as any).grossWeight !== undefined) (updateData as any).gross_weight = (productData as any).grossWeight;

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

  function getMenuProducts(): Product[] {
    return products.filter((p) => p.active && p.menuItem !== false);
  }

  function getNewProducts(): Product[] {
    return products.filter((p) => p.active && p.isNew && p.menuItem !== false);
  }

  async function toggleNewProduct(productId: string, isNew: boolean): Promise<boolean> {
    if (isNew) {
      const currentNewCount = products.filter(p => p.isNew).length;
      if (currentNewCount >= 5) {
        toast.error('Limite de 5 produtos em novidade atingido!');
        return false;
      }
    }
    try {
      const { error } = await supabase
        .from('products')
        .update({ is_new: isNew } as any)
        .eq('id', productId);
      if (error) throw error;
      await fetchProducts();
      toast.success(isNew ? 'Produto adicionado à seção em destaque!' : 'Produto removido da seção em destaque');
      return true;
    } catch (error) {
      console.error('Error toggling new product:', error);
      toast.error('Erro ao atualizar produto');
      return false;
    }
  }

  function getCategories(): string[] {
    return [...new Set(products.map((p) => p.category))];
  }

  async function duplicateProduct(productId: string): Promise<string | null> {
    const source = products.find(p => p.id === productId);
    if (!source) return null;

    try {
      // 1. Duplicate the product
      const { data: newProduct, error: prodError } = await supabase
        .from('products')
        .insert({
          name: `${source.name} (cópia)`,
          price: source.price,
          category: source.category,
          description: source.description || null,
          image_url: source.imageUrl || null,
          active: source.active,
          company_id: source.companyId || companyId || null,
          tax_rule_id: source.taxRuleId || null,
          display_order: (source.displayOrder ?? 0) + 1,
        })
        .select()
        .single();

      if (prodError) throw prodError;

      // 2. Duplicate product_optionals
      if (source.optionals && source.optionals.length > 0) {
        const optInserts = source.optionals.map(opt => ({
          product_id: newProduct.id,
          name: opt.name,
          price: opt.price,
          type: opt.type,
          active: opt.active,
          company_id: source.companyId || companyId || null,
        }));
        const { error: optError } = await supabase.from('product_optionals').insert(optInserts);
        if (optError) throw optError;
      }

      // 3. Duplicate optional_group_products associations
      const { data: groupLinks, error: glError } = await supabase
        .from('optional_group_products')
        .select('*')
        .eq('product_id', productId);

      if (glError) throw glError;

      if (groupLinks && groupLinks.length > 0) {
        const glInserts = groupLinks.map(gl => ({
          group_id: gl.group_id,
          product_id: newProduct.id,
          min_select_override: gl.min_select_override,
          max_select_override: gl.max_select_override,
        }));
        const { error: glInsertError } = await supabase.from('optional_group_products').insert(glInserts);
        if (glInsertError) throw glInsertError;
      }

      await fetchProducts();
      toast.success('Produto duplicado!');
      return newProduct.id;
    } catch (error) {
      console.error('Error duplicating product:', error);
      toast.error('Erro ao duplicar produto');
      return null;
    }
  }

  async function moveProduct(productId: string, direction: 'up' | 'down', categoryProducts: Product[]): Promise<void> {
    const idx = categoryProducts.findIndex(p => p.id === productId);
    if (idx < 0) return;
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= categoryProducts.length) return;

    // Reorder the array swapping the two items
    const reordered = [...categoryProducts];
    [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

    try {
      // Reassign sequential display_order values for the whole category
      // This ensures ordering works even when products share the same display_order (e.g. all 0)
      await Promise.all(
        reordered.map((p, i) =>
          supabase.from('products').update({ display_order: i }).eq('id', p.id)
        )
      );
      await fetchProducts();
    } catch (error) {
      console.error('Error moving product:', error);
      toast.error('Erro ao reordenar produto');
    }
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
    getMenuProducts,
    getNewProducts,
    getCategories,
    moveProduct,
    duplicateProduct,
    toggleNewProduct,
    refetch: fetchProducts,
  };
}
