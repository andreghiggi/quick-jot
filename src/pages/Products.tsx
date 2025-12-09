import { useState, useEffect, useRef } from 'react';
import { useProducts } from '@/hooks/useProducts';
import { Product, ProductOptional } from '@/types/product';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, ArrowLeft, Package, Link as LinkIcon, Settings, Upload, Pencil, AlertTriangle } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const defaultCategories = ['Lanches', 'Bebidas', 'Porções', 'Sobremesas'];
const STORE_PHONE_KEY = 'comandatech_store_phone';

export default function Products() {
  const { products, loading, addProduct, updateProduct, deleteProduct, addOptional, deleteOptional } = useProducts();
  const [isProductDialogOpen, setIsProductDialogOpen] = useState(false);
  const [isOptionalDialogOpen, setIsOptionalDialogOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: 'Lanches', description: '', active: true, imageUrl: '' });
  const [newOptional, setNewOptional] = useState({ name: '', price: '', type: 'extra' as 'extra' | 'variation' });
  const [storePhone, setStorePhone] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);

  const menuLink = `${window.location.origin}/cardapio`;

  useEffect(() => {
    const savedPhone = localStorage.getItem(STORE_PHONE_KEY);
    if (savedPhone) setStorePhone(savedPhone);
  }, []);

  function saveStorePhone() {
    localStorage.setItem(STORE_PHONE_KEY, storePhone);
    toast.success('Número salvo!');
    setIsSettingsOpen(false);
  }

  async function uploadImage(file: File): Promise<string | null> {
    setIsUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      
      if (error) throw error;
      
      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);
      
      return publicUrl;
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
    await addProduct({
      name: newProduct.name,
      price: parseFloat(newProduct.price),
      category: newProduct.category,
      description: newProduct.description || undefined,
      imageUrl: newProduct.imageUrl || undefined,
      active: newProduct.active,
    });
    setNewProduct({ name: '', price: '', category: 'Lanches', description: '', active: true, imageUrl: '' });
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
    });
    setEditingProduct(null);
  }

  function copyMenuLink() {
    navigator.clipboard.writeText(menuLink);
    toast.success('Link copiado!');
  }

  async function clearAllProducts() {
    try {
      // First delete all product optionals
      const { error: optionalsError } = await supabase
        .from('product_optionals')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (optionalsError) throw optionalsError;

      // Then delete all products
      const { error: productsError } = await supabase
        .from('products')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

      if (productsError) throw productsError;

      toast.success('Todos os produtos foram removidos!');
      window.location.reload();
    } catch (error) {
      console.error('Error clearing products:', error);
      toast.error('Erro ao limpar produtos');
    }
  }

  const groupedProducts = products.reduce((acc, product) => {
    if (!acc[product.category]) acc[product.category] = [];
    acc[product.category].push(product);
    return acc;
  }, {} as Record<string, Product[]>);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Carregando...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <Package className="h-6 w-6 text-primary" />
                <h1 className="text-xl font-bold">Produtos</h1>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setIsSettingsOpen(true)}>
                <Settings className="h-4 w-4 mr-2" />
                Config
              </Button>
              <Button variant="outline" size="sm" onClick={copyMenuLink}>
                <LinkIcon className="h-4 w-4 mr-2" />
                Copiar link
              </Button>
              <Dialog open={isProductDialogOpen} onOpenChange={setIsProductDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Novo Produto
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
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {defaultCategories.map((cat) => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
                    <Button onClick={handleAddProduct} className="w-full">Salvar</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
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

        {Object.entries(groupedProducts).map(([category, categoryProducts]) => (
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
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedProduct(product);
                            setIsOptionalDialogOpen(true);
                          }}
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(product)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => updateProduct(product.id, { active: !product.active })}
                        >
                          {product.active ? 'Desativar' : 'Ativar'}
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
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
      </main>

      <Dialog open={isOptionalDialogOpen} onOpenChange={setIsOptionalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adicionar Opcional - {selectedProduct?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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

      <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Configurações</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
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
            <Button onClick={saveStorePhone} className="w-full">Salvar</Button>

            <div className="border-t pt-4 mt-4">
              <Label className="text-destructive">Zona de perigo</Label>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="w-full mt-2">
                    <AlertTriangle className="h-4 w-4 mr-2" />
                    Zerar todos os produtos
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tem certeza?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Esta ação irá remover TODOS os produtos e seus opcionais da base de dados. 
                      Esta ação não pode ser desfeita. As configurações do sistema (número do WhatsApp) serão mantidas.
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
                    {defaultCategories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
              <Button onClick={handleUpdateProduct} className="w-full">Salvar alterações</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
