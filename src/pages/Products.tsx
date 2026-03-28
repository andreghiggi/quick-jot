import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useCategories, CategorySortMode } from '@/hooks/useCategories';
import { useStoreSettings } from '@/hooks/useStoreSettings';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Link as LinkIcon, Settings, Upload, Pencil, AlertTriangle, FolderOpen, Image, Loader2, Package, ChevronUp, ChevronDown, GripVertical, FileText, Copy } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { BulkTaxRuleDialog } from '@/components/products/BulkTaxRuleDialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { uploadCompressedImage } from '@/utils/imageUtils';

export default function Products() {
  const { company } = useAuthContext();
  const { products, loading, addProduct, updateProduct, deleteProduct, addOptional, deleteOptional, moveProduct, duplicateProduct, refetch: refetchProducts } = useProducts({ companyId: company?.id });
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });
  const { categories, addCategory, deleteCategory, updateCategory: _updateCategory, sortMode, saveSortMode, moveCategory } = useCategories({ companyId: company?.id });
  
  // Wrap updateCategory to also refetch products when a category is renamed
  const updateCategory = async (id: string, data: Partial<import('@/types/order').Category>) => {
    const result = await _updateCategory(id, data);
    if (result && data.name !== undefined) {
      await refetchProducts();
    }
    return result;
  };
  const { settings, saveStorePhone, saveBannerUrl, saveStoreName } = useStoreSettings({ companyId: company?.id });
  const { taxRules, bulkAssignTaxRule } = useTaxRules({ companyId: company?.id });
  
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isOptionalDialogOpen, setIsOptionalDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: '', description: '', active: true, imageUrl: '', pdvItem: true });
  const [newOptional, setNewOptional] = useState({ name: '', price: '', type: 'extra' as 'extra' | 'variation' });
  const [newCategoryName, setNewCategoryName] = useState('');
  const [storePhone, setStorePhone] = useState('');
  const [storeName, setStoreName] = useState('');
  const [bannerUrl, setBannerUrl] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isBannerUploading, setIsBannerUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  const bannerFileInputRef = useRef<HTMLInputElement>(null);
  const [isBulkTaxOpen, setIsBulkTaxOpen] = useState(false);
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string | null>(null);
  const menuLink = company?.slug ? `${window.location.origin}/cardapio/${company.slug}` : `${window.location.origin}/cardapio`;

  useEffect(() => {
    setStorePhone(settings.storePhone);
    setStoreName(settings.storeName);
    setBannerUrl(settings.bannerUrl);
  }, [settings]);

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

  async function handleSaveSettings() {
    await saveStorePhone(storePhone);
    await saveStoreName(storeName);
    if (bannerUrl !== settings.bannerUrl) {
      await saveBannerUrl(bannerUrl);
    }
    setIsSettingsOpen(false);
  }

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

  async function uploadBanner(file: File): Promise<string | null> {
    setIsBannerUploading(true);
    try {
      const fileName = `banner_${Date.now()}`;
      const result = await uploadCompressedImage(supabase, 'product-images', `${fileName}.webp`, file, { maxWidth: 1920 });
      if (!result) throw new Error('Upload failed');
      return result.publicUrl;
    } catch (error) {
      console.error('Error uploading banner:', error);
      toast.error('Erro ao enviar banner');
      return null;
    } finally {
      setIsBannerUploading(false);
    }
  }

  async function handleBannerSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    const imageUrl = await uploadBanner(file);
    if (imageUrl) {
      setBannerUrl(imageUrl);
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

  async function handleAddCategory() {
    if (!newCategoryName.trim()) {
      toast.error('Informe o nome da categoria');
      return;
    }
    const success = await addCategory(newCategoryName.trim());
    if (success) {
      setNewCategoryName('');
    }
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

  async function clearAllProducts() {
    try {
      const { error: optionalsError } = await supabase
        .from('product_optionals')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (optionalsError) throw optionalsError;

      const { error: productsError } = await supabase
        .from('products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000');

      if (productsError) throw productsError;

      toast.success('Todos os produtos foram removidos!');
      window.location.reload();
    } catch (error) {
      console.error('Error clearing products:', error);
      toast.error('Erro ao limpar produtos');
    }
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
      <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(true)}>
        <Settings className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Config</span>
      </Button>
      <Button variant="outline" size="sm" onClick={copyMenuLink}>
        <LinkIcon className="h-4 w-4 mr-2" />
        <span className="hidden sm:inline">Copiar link</span>
      </Button>
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
        <Card className="bg-primary/10 border-primary/20">
          <CardContent className="py-4">
            <p className="text-sm">
              <strong>Link do cardápio:</strong>{' '}
              <a href={menuLink} target="_blank" rel="noopener noreferrer" className="text-primary underline">
                {menuLink}
              </a>
            </p>
          </CardContent>
        </Card>

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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={categoryProducts.indexOf(product) === 0}
                          onClick={() => moveProduct(product.id, 'up', categoryProducts)}
                        >
                          <ChevronUp className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          disabled={categoryProducts.indexOf(product) === categoryProducts.length - 1}
                          onClick={() => moveProduct(product.id, 'down', categoryProducts)}
                        >
                          <ChevronDown className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => openEditDialog(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
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
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Duplicar produto"
                          onClick={() => duplicateProduct(product.id)}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => deleteProduct(product.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
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

      {/* Settings Dialog */}
      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Configurações</DialogTitle>
          </DialogHeader>
          <Tabs defaultValue="geral" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="geral">Geral</TabsTrigger>
              <TabsTrigger value="categorias">Categorias</TabsTrigger>
              <TabsTrigger value="perigo">Perigo</TabsTrigger>
            </TabsList>
            
            <TabsContent value="geral" className="space-y-4 mt-4">
              <div>
                <Label>Nome da Loja</Label>
                <Input
                  value={storeName}
                  onChange={(e) => setStoreName(e.target.value)}
                  placeholder="Nome da sua loja"
                />
              </div>
              <div>
                <Label>Número do WhatsApp da loja</Label>
                <Input
                  value={storePhone}
                  onChange={(e) => setStorePhone(e.target.value)}
                  placeholder="5511999999999"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Formato: código do país + DDD + número (ex: 5511999999999)
                </p>
              </div>
              <div>
                <Label>Banner do Cardápio</Label>
                <input
                  type="file"
                  accept="image/*"
                  ref={bannerFileInputRef}
                  onChange={handleBannerSelect}
                  className="hidden"
                />
                {bannerUrl ? (
                  <div className="relative mt-2">
                    <img
                      src={bannerUrl}
                      alt="Banner Preview"
                      className="w-full h-32 object-cover rounded"
                    />
                    <Button
                      variant="destructive"
                      size="icon"
                      className="absolute top-1 right-1 h-6 w-6"
                      onClick={() => setBannerUrl('')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full mt-2"
                    onClick={() => bannerFileInputRef.current?.click()}
                    disabled={isBannerUploading}
                  >
                    {isBannerUploading ? (
                      'Enviando...'
                    ) : (
                      <>
                        <Image className="h-4 w-4 mr-2" />
                        Selecionar banner
                      </>
                    )}
                  </Button>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  Recomendado: 1200x400 pixels
                </p>
              </div>
              <Button onClick={handleSaveSettings} className="w-full">Salvar Configurações</Button>
            </TabsContent>

            <TabsContent value="categorias" className="space-y-4 mt-4">
              <div>
                <Label>Nova Categoria</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="Nome da categoria"
                    onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  />
                  <Button onClick={handleAddCategory}>
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              
              <div>
                <Label>Ordenação</Label>
                <Select value={sortMode} onValueChange={(v: CategorySortMode) => saveSortMode(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Ordem manual</SelectItem>
                    <SelectItem value="alphabetical">Ordem alfabética</SelectItem>
                    <SelectItem value="created">Ordem de cadastro</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  {sortMode === 'manual' && 'Use as setas para reordenar as categorias'}
                  {sortMode === 'alphabetical' && 'Categorias ordenadas de A-Z'}
                  {sortMode === 'created' && 'Categorias ordenadas pela data de criação'}
                </p>
              </div>

              <div className="space-y-2">
                <Label>Categorias existentes ({categories.length})</Label>
                <div className="h-[250px] rounded border overflow-hidden">
                  <ScrollArea className="h-full">
                    <div className="space-y-2 p-2">
                      {categories.map((cat, index) => (
                        <div key={cat.id} className="flex items-center justify-between p-2 border rounded bg-background">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {sortMode === 'manual' && (
                              <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                            )}
                            <Popover>
                              <PopoverTrigger asChild>
                                <button className="hover:bg-muted rounded p-1 transition-colors flex-shrink-0 w-8 h-8 flex items-center justify-center overflow-hidden" title="Alterar ícone">
                                  {cat.imageUrl ? (
                                    <img src={cat.imageUrl} alt={cat.name} className="w-7 h-7 rounded object-cover" />
                                  ) : (
                                    <span className="text-xl">{cat.emoji || '🍽️'}</span>
                                  )}
                                </button>
                              </PopoverTrigger>
                              <PopoverContent className="w-auto p-3" align="start">
                                <div className="space-y-3">
                                  <p className="text-xs font-medium text-muted-foreground">Escolha um emoji</p>
                                  <div className="grid grid-cols-6 gap-1">
                                    {['🍔', '🍕', '🍟', '🌭', '🥪', '🌮', '🍝', '🍣', '🍱', '🥗', '🥩', '🐟', '🦐', '🍗', '🥟', '🍰', '🍩', '🍦', '🧁', '🍇', '☕', '🧃', '🥤', '🍺', '🍷', '🧋', '🥂', '🍸', '🎁', '🍽️'].map(emoji => (
                                      <button
                                        key={emoji}
                                        className={cn("text-xl p-1.5 rounded hover:bg-muted transition-colors", cat.emoji === emoji && !cat.imageUrl && "bg-primary/10 ring-1 ring-primary")}
                                        onClick={() => updateCategory(cat.id, { emoji, imageUrl: '' })}
                                      >
                                        {emoji}
                                      </button>
                                    ))}
                                  </div>
                                  <div className="border-t pt-2">
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Ou envie uma imagem</p>
                                    <input
                                      type="file"
                                      accept="image/*"
                                      className="hidden"
                                      id={`cat-img-${cat.id}`}
                                      onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        try {
                                          const path = `categories/${cat.id}.webp`;
                                          const result = await uploadCompressedImage(supabase, 'product-images', path, file, { upsert: true });
                                          if (!result) throw new Error('Upload failed');
                                          await updateCategory(cat.id, { imageUrl: result.publicUrl + '?t=' + Date.now() });
                                        } catch (err) {
                                          console.error(err);
                                          toast.error('Erro ao enviar imagem');
                                        }
                                        e.target.value = '';
                                      }}
                                    />
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="w-full"
                                      onClick={() => document.getElementById(`cat-img-${cat.id}`)?.click()}
                                    >
                                      <Image className="h-4 w-4 mr-2" />
                                      Buscar imagem
                                    </Button>
                                    {cat.imageUrl && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="w-full mt-1 text-destructive"
                                        onClick={() => updateCategory(cat.id, { imageUrl: '', emoji: cat.emoji || '🍽️' })}
                                      >
                                        Remover imagem
                                      </Button>
                                    )}
                                  </div>
                                </div>
                              </PopoverContent>
                            </Popover>
                            <span className="truncate">{cat.name}</span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            {sortMode === 'manual' && (
                              <>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => moveCategory(cat.id, 'up')}
                                  disabled={index === 0}
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => moveCategory(cat.id, 'down')}
                                  disabled={index === categories.length - 1}
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive h-8 w-8 p-0"
                              onClick={() => deleteCategory(cat.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                      {categories.length === 0 && (
                        <p className="text-sm text-muted-foreground p-2">Nenhuma categoria cadastrada</p>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="perigo" className="space-y-4 mt-4">
              <div className="border border-destructive/30 rounded-lg p-4 bg-destructive/5">
                <Label className="text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Zona de perigo
                </Label>
                <p className="text-sm text-muted-foreground mt-2">
                  Esta ação irá remover TODOS os produtos e seus opcionais da base de dados. 
                  Esta ação não pode ser desfeita.
                </p>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="w-full mt-4">
                      <AlertTriangle className="h-4 w-4 mr-2" />
                      Zerar todos os produtos
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta ação irá remover TODOS os produtos e seus opcionais da base de dados. 
                        Esta ação não pode ser desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={clearAllProducts} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                        Sim, zerar produtos
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TabsContent>
          </Tabs>
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
