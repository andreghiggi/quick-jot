import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useCategories } from '@/hooks/useCategories';

import { Product, ProductOptional } from '@/types/product';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, Upload, Pencil, FolderOpen, Image, Loader2, Package, ChevronUp, ChevronDown, FileText, Copy, Star, Camera, Check, X } from 'lucide-react';
import { BulkTaxRuleDialog } from '@/components/products/BulkTaxRuleDialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { uploadCompressedImage } from '@/utils/imageUtils';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

interface ExtractedProduct {
  name: string;
  price: number;
  category: string;
  description?: string;
  selected: boolean;
}

export default function Products() {
  const { company } = useAuthContext();
  const { products, loading, addProduct, updateProduct, deleteProduct, addOptional, deleteOptional, moveProduct, duplicateProduct, toggleNewProduct, refetch: refetchProducts } = useProducts({ companyId: company?.id });
  const { settings: storeSettings } = useStoreSettings({ companyId: company?.id });
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { taxRules, bulkAssignTaxRule } = useTaxRules({ companyId: company?.id });
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isOptionalDialogOpen, setIsOptionalDialogOpen] = useState(false);
  
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: '', description: '', active: true, imageUrl: '', pdvItem: true });
  const [newOptional, setNewOptional] = useState({ name: '', price: '', type: 'extra' as 'extra' | 'variation' });
  
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const [isBulkTaxOpen, setIsBulkTaxOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const menuLink = company?.slug ? `${window.location.origin}/cardapio/${company.slug}` : `${window.location.origin}/cardapio`;

  // AI import state
  const importFileRef = useRef<HTMLInputElement>(null);
  const importCameraRef = useRef<HTMLInputElement>(null);
  const [importStep, setImportStep] = useState<'idle' | 'preview' | 'review'>('idle');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreviewUrl, setImportPreviewUrl] = useState<string | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImportSaving, setIsImportSaving] = useState(false);
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);

  // Set default category when categories load
  useEffect(() => {
    if (categories.length > 0 && !newProduct.category) {
      setNewProduct(prev => ({ ...prev, category: categories[0].name }));
    }
  }, [categories]);

  // Get unique saved optionals from all products for quick reuse
  const savedOptionals = useMemo(() => {
    const optionalsMap = new Map<string, { name: string; price: number; type: 'extra' | 'variation' }>();
    products.forEach(product => {
      product.optionals?.forEach(opt => {
        // Use name as key to avoid duplicates
        if (!optionalsMap.has(opt.name)) {
          optionalsMap.set(opt.name, {
            name: opt.name,
            price: opt.price,
            type: opt.type
          });
        }
      });
    });
    return Array.from(optionalsMap.values());
  }, [products]);

  async function uploadImage(file: File): Promise<string | null> {
    setIsUploading(true);
    try {
      const fileName = `${Date.now()}`;
      const result = await uploadCompressedImage(supabase, 'product-images', `${fileName}.webp`, file);
      if (!result) throw new Error('Upload failed');
      return result.publicUrl;
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Erro ao enviar imagem');
      return null;
    } finally {
      setIsUploading(false);
    }
  }


  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const imageUrl = await uploadImage(file);
    if (imageUrl) {
      setNewProduct({ ...newProduct, imageUrl });
    }
  }

  async function handleAddProduct() {
    if (!newProduct.name || !newProduct.price) {
      toast.error('Preencha nome e preço');
      return;
    }
    if (!newProduct.category) {
      toast.error('Selecione uma categoria');
      return;
    }
    await addProduct({
      name: newProduct.name,
      price: parseFloat(newProduct.price),
      category: newProduct.category,
      description: newProduct.description || undefined,
      imageUrl: newProduct.imageUrl || undefined,
      active: newProduct.active,
    });
    setNewProduct({ name: '', price: '', category: categories[0]?.name || '', description: '', active: true, imageUrl: '', pdvItem: true });
    setIsProductDialogOpen(false);
  }

  async function handleAddOptional() {
    if (!selectedProduct || !newOptional.name) {
      toast.error('Preencha o nome do opcional');
      return;
    }
    await addOptional({
      productId: selectedProduct.id,
      name: newOptional.name,
      price: parseFloat(newOptional.price) || 0,
      type: newOptional.type,
      active: true,
    });
    setNewOptional({ name: '', price: '', type: 'extra' });
    setIsOptionalDialogOpen(false);
  }


  function openEditDialog(product: Product) {
    setEditingProduct(product);
  }

  async function handleEditImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !editingProduct) return;
    
    const imageUrl = await uploadImage(file);
    if (imageUrl) {
      setEditingProduct({ ...editingProduct, imageUrl });
    }
  }

  async function handleUpdateProduct() {
    if (!editingProduct) return;
    if (!editingProduct.name || !editingProduct.price) {
      toast.error('Preencha nome e preço');
      return;
    }
    await updateProduct(editingProduct.id, {
      name: editingProduct.name,
      price: editingProduct.price,
      category: editingProduct.category,
      description: editingProduct.description,
      imageUrl: editingProduct.imageUrl,
      active: editingProduct.active,
      pdvItem: editingProduct.pdvItem,
    });
    setEditingProduct(null);
  }

  function copyMenuLink() {
    navigator.clipboard.writeText(menuLink);
    toast.success('Link copiado!');
  }

  // --- AI Import handlers ---
  function handleImportFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setImportFile(f);
    if (f.type.startsWith('image/')) {
      setImportPreviewUrl(URL.createObjectURL(f));
    } else {
      setImportPreviewUrl(null);
    }
    setImportStep('preview');
  }

  async function handleImportExtract() {
    if (!importFile || !company?.id) return;
    setIsExtracting(true);
    try {
      const fileExt = importFile.name.split('.').pop();
      const fileName = `menu-import/${company.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage.from('product-images').upload(fileName, importFile);
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('product-images').getPublicUrl(fileName);

      const { data, error } = await supabase.functions.invoke('extract-menu', {
        body: { imageUrl: publicUrl, fileType: importFile.type }
      });
      if (error) throw error;

      if (data?.products && Array.isArray(data.products)) {
        setExtractedProducts(data.products.map((p: any) => ({
          name: p.name || '',
          price: parseFloat(p.price) || 0,
          category: p.category || 'Geral',
          description: p.description || '',
          selected: true,
        })));
        setImportStep('review');
        toast.success(`${data.products.length} produtos encontrados!`);
      } else {
        toast.error('Não foi possível extrair produtos');
      }
    } catch (error: any) {
      console.error('Error extracting menu:', error);
      toast.error(error.message || 'Erro ao processar');
    } finally {
      setIsExtracting(false);
    }
  }

  async function handleImportSave() {
    const selected = extractedProducts.filter(p => p.selected);
    if (selected.length === 0) {
      toast.error('Selecione pelo menos um produto');
      return;
    }
    setIsImportSaving(true);
    let successCount = 0;
    try {
      const existingCatNames = categories.map(c => c.name);
      const newCats = [...new Set(selected.map(p => p.category))].filter(c => !existingCatNames.includes(c));
      for (const catName of newCats) {
        await addCategory(catName);
      }
      for (const product of selected) {
        try {
          await addProduct({
            name: product.name,
            price: product.price,
            category: product.category,
            description: product.description || undefined,
            active: true,
          });
          successCount++;
        } catch (err) {
          console.error('Error adding product:', product.name, err);
        }
      }
      toast.success(`${successCount} produtos importados!`);
      resetImport();
    } catch {
      toast.error('Erro ao importar produtos');
    } finally {
      setIsImportSaving(false);
    }
  }

  function resetImport() {
    setImportFile(null);
    setImportPreviewUrl(null);
    setExtractedProducts([]);
    setImportStep('idle');
  }


  // Group products by category, maintaining category order
  const groupedProducts = useMemo(() => {
    const grouped = products.reduce((acc, product) => {
      if (!acc[product.category]) acc[product.category] = [];
      acc[product.category].push(product);
      return acc;
    }, {} as Record<string, Product[]>);
    
    // Return entries ordered by category order
    const orderedEntries: [string, Product[]][] = [];
    categories.forEach(cat => {
      if (grouped[cat.name]) {
        orderedEntries.push([cat.name, grouped[cat.name]]);
      }
    });
    // Add any categories not in the categories list (orphaned)
    Object.entries(grouped).forEach(([catName, prods]) => {
      if (!categories.find(c => c.name === catName)) {
        orderedEntries.push([catName, prods]);
      }
    });
    return orderedEntries;
  }, [products, categories]);

  const filteredGroupedProducts = useMemo(() => {
    if (!selectedCategoryFilter) return groupedProducts;
    return groupedProducts.filter(([category]) => category === selectedCategoryFilter);
  }, [groupedProducts, selectedCategoryFilter]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const headerActions = (
    <div className="flex items-center gap-2">
      {taxRules.length > 0 && (
        <Button variant="outline" size="sm" onClick={() => setIsBulkTaxOpen(true)}>
          <FileText className="h-4 w-4 mr-2" />
          <span className="hidden sm:inline">Tributação em massa</span>

        </Button>
      )}
      <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Novo Produto</span>
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo Produto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={newProduct.name}
                onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
                placeholder="Nome do produto"
              />
            </div>
            <div>
              <Label>Preço (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={newProduct.price}
                onChange={(e) => setNewProduct({ ...newProduct, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select value={newProduct.category} onValueChange={(v) => setNewProduct({ ...newProduct, category: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma categoria" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Descrição (opcional)</Label>
              <Input
                value={newProduct.description}
                onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
                placeholder="Descrição do produto"
              />
            </div>
            <div>
              <Label>Foto do produto</Label>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                onChange={handleImageSelect}
                className="hidden"
              />
              {newProduct.imageUrl ? (
                <div className="relative mt-2">
                  <img
                    src={newProduct.imageUrl}
                    alt="Preview"
                    className="w-full h-32 object-cover rounded"
                  />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-1 right-1 h-6 w-6"
                    onClick={() => setNewProduct({ ...newProduct, imageUrl: '' })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full mt-2"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  {isUploading ? (
                    'Enviando...'
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Selecionar imagem
                    </>
                  )}
                </Button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Switch
                checked={newProduct.active}
                onCheckedChange={(v) => setNewProduct({ ...newProduct, active: v })}
              />
              <Label>Ativo</Label>
            </div>
            {isModuleEnabled('pdv') && (
              <div className="flex items-center gap-2">
                <Switch
                  checked={newProduct.pdvItem}
                  onCheckedChange={(v) => setNewProduct({ ...newProduct, pdvItem: v })}
                />
                <Label>Item de PDV</Label>
              </div>
            )}
            <Button onClick={handleAddProduct} className="w-full">Salvar</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );

  return (
    <AppLayout title="Produtos" actions={headerActions}>
      <div className="space-y-6">

        {/* Category filter chips */}
        {groupedProducts.length > 1 && (
          <div className="flex gap-2 flex-wrap pb-1">
            <Badge
              variant={selectedCategoryFilter === null ? 'default' : 'outline'}
              className="cursor-pointer whitespace-nowrap flex-shrink-0 px-3 py-1.5 text-sm"
              onClick={() => setSelectedCategoryFilter(null)}
            >
              Todas ({products.length})
            </Badge>
            {groupedProducts.map(([category, categoryProducts]) => (
              <Badge
                key={category}
                variant={selectedCategoryFilter === category ? 'default' : 'outline'}
                className="cursor-pointer whitespace-nowrap flex-shrink-0 px-3 py-1.5 text-sm"
                onClick={() => setSelectedCategoryFilter(prev => prev === category ? null : category)}
              >
                {category} ({categoryProducts.length})
              </Badge>
            ))}
          </div>
        )}

        {filteredGroupedProducts.map(([category, categoryProducts]) => (
          <div key={category}>
            <h2 className="text-lg font-semibold mb-3">{category}</h2>
            <div className="grid gap-3">
              {categoryProducts.map((product) => (
                <Card key={product.id} className={!product.active ? 'opacity-50' : ''}>
                  <CardContent className="py-4">
                    <div className="flex items-start gap-4">
                      {product.imageUrl && (
                        <img
                          src={product.imageUrl}
                          alt={product.name}
                          className="w-16 h-16 object-cover rounded flex-shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium">{product.name}</h3>
                          {!product.active && <Badge variant="secondary">Inativo</Badge>}
                          {product.isNew && <Badge variant="default" className="bg-amber-500 text-white text-xs">⭐ {storeSettings.featuredSectionName}</Badge>}
                        </div>
                        {product.description && (
                          <p className="text-sm text-muted-foreground">{product.description}</p>
                        )}
                        <p className="text-primary font-semibold mt-1">
                          R$ {product.price.toFixed(2)}
                        </p>

                        {product.optionals && product.optionals.length > 0 && (
                          <div className="mt-3 space-y-1">
                            <p className="text-xs font-medium text-muted-foreground">Opcionais:</p>
                            <div className="flex flex-wrap gap-1">
                              {product.optionals.map((opt) => (
                                <Badge
                                  key={opt.id}
                                  variant={opt.type === 'extra' ? 'default' : 'outline'}
                                  className="text-xs cursor-pointer"
                                  onClick={() => deleteOptional(opt.id)}
                                >
                                  {opt.name} {opt.price > 0 && `+R$${opt.price.toFixed(2)}`}
                                  <Trash2 className="h-3 w-3 ml-1" />
                                </Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-1">
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={categoryProducts.indexOf(product) === 0}
                            onClick={() => moveProduct(product.id, 'up', categoryProducts)}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para cima</span>
                        </div>
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            disabled={categoryProducts.indexOf(product) === categoryProducts.length - 1}
                            onClick={() => moveProduct(product.id, 'down', categoryProducts)}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Mover para baixo</span>
                        </div>
                        <div className="relative group">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditDialog(product)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Editar produto</span>
                        </div>
                        <div className="relative group">
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              setSelectedProduct(product);
                              setIsOptionalDialogOpen(true);
                            }}
                          >
                            <Plus className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Adicionar opcional</span>
                        </div>
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn("h-7 w-7", product.isNew ? "text-amber-500" : "text-muted-foreground")}
                            onClick={() => toggleNewProduct(product.id, !product.isNew)}
                          >
                            <Star className={cn("h-4 w-4", product.isNew && "fill-current")} />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Destacar produto</span>
                        </div>
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => duplicateProduct(product.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Duplicar produto</span>
                        </div>
                        <div className="relative group">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive"
                            onClick={() => deleteProduct(product.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 px-2 py-1 text-xs text-white bg-gray-800 rounded whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">Excluir produto</span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ))}

        {products.length === 0 && (
          <Card>
            <CardContent className="py-12 text-center">
              <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhum produto cadastrado</p>
              <Button className="mt-4" onClick={() => setIsProductDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Adicionar primeiro produto
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Optional Dialog */}
      <Dialog open={isOptionalDialogOpen} onOpenChange={setIsOptionalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Opcional - {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Saved optionals quick select */}
            {savedOptionals.length > 0 && (
              <div>
                <Label>Usar opcional salvo</Label>
                <Select 
                  value="" 
                  onValueChange={(value) => {
                    const saved = savedOptionals.find(o => o.name === value);
                    if (saved) {
                      setNewOptional({
                        name: saved.name,
                        price: saved.price.toString(),
                        type: saved.type
                      });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um opcional já usado..." />
                  </SelectTrigger>
                  <SelectContent>
                    {savedOptionals.map((opt, idx) => (
                      <SelectItem key={`${opt.name}-${idx}`} value={opt.name}>
                        {opt.name} {opt.price > 0 ? `(+R$${opt.price.toFixed(2)})` : ''} - {opt.type === 'extra' ? 'Extra' : 'Variação'}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Ou preencha manualmente abaixo
                </p>
              </div>
            )}
            <div>
              <Label>Nome</Label>
              <Input
                value={newOptional.name}
                onChange={(e) => setNewOptional({ ...newOptional, name: e.target.value })}
                placeholder="Ex: Bacon, Ponto da carne"
              />
            </div>
            <div>
              <Label>Preço adicional (R$) - deixe 0 para variações sem custo</Label>
              <Input
                type="number"
                step="0.01"
                value={newOptional.price}
                onChange={(e) => setNewOptional({ ...newOptional, price: e.target.value })}
                placeholder="0.00"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={newOptional.type} onValueChange={(v: 'extra' | 'variation') => setNewOptional({ ...newOptional, type: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="extra">Extra (com custo)</SelectItem>
                  <SelectItem value="variation">Variação (sem custo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddOptional} className="w-full">Adicionar</Button>
          </div>
        </DialogContent>
      </Dialog>


      {/* Edit Product Dialog */}
      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Produto</DialogTitle>
          </DialogHeader>
          {editingProduct && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editingProduct.name}
                  onChange={(e) => setEditingProduct({ ...editingProduct, name: e.target.value })}
                  placeholder="Nome do produto"
                />
              </div>
              <div>
                <Label>Preço (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={editingProduct.price}
                  onChange={(e) => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label>Categoria</Label>
                <Select value={editingProduct.category} onValueChange={(v) => setEditingProduct({ ...editingProduct, category: v })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>{cat.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Descrição (opcional)</Label>
                <Input
                  value={editingProduct.description || ''}
                  onChange={(e) => setEditingProduct({ ...editingProduct, description: e.target.value })}
                  placeholder="Descrição do produto"
                />
              </div>
              <div>
                <Label>Foto do produto</Label>
                <input
                  type="file"
                  accept="image/*"
                  ref={editFileInputRef}
                  onChange={handleEditImageSelect}
                  className="hidden"
                />
                {editingProduct.imageUrl ? (
                  <div className="relative mt-2">
                    <img
                      src={editingProduct.imageUrl}
                      alt="Preview"
                      className="w-full h-32 object-cover rounded"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => setEditingProduct({ ...editingProduct, imageUrl: undefined })}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => editFileInputRef.current?.click()}
                    disabled={isUploading}
                  >
                    {isUploading ? (
                      'Enviando...'
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Selecionar imagem
                      </>
                    )}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={editingProduct.active}
                  onCheckedChange={(v) => setEditingProduct({ ...editingProduct, active: v })}
                />
                <Label>Ativo</Label>
              </div>
              {isModuleEnabled('pdv') && (
                <div className="flex items-center gap-2">
                  <Switch
                    checked={editingProduct.pdvItem !== false}
                    onCheckedChange={(v) => setEditingProduct({ ...editingProduct, pdvItem: v })}
                  />
                  <Label>Item de PDV</Label>
                </div>
              )}
              <Button onClick={handleUpdateProduct} className="w-full">Salvar alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Bulk Tax Rule Dialog */}
      <BulkTaxRuleDialog
        open={isBulkTaxOpen}
        onOpenChange={setIsBulkTaxOpen}
        products={products}
        taxRules={taxRules}
        categories={categories}
        onApply={async (productIds, taxRuleId) => {
          const success = await bulkAssignTaxRule(productIds, taxRuleId);
          if (success) refetchProducts();
          return success;
        }}
      />
    </AppLayout>
  );
}
