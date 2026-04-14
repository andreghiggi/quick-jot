import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import { useSubcategories } from '@/hooks/useSubcategories';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Upload, Loader2, Eye, Check, FileImage, Trash2, Plus, Sparkles } from 'lucide-react';

interface ExtractedProduct {
  name: string;
  price: number;
  category: string;
  categoryId: string | null;
  subcategoryId: string | null;
  description: string;
  isNewCategory: boolean;
}

export default function MenuImport() {
  const { company } = useAuthContext();
  const { categories, addCategory, refetch: refetchCategories } = useCategories({ companyId: company?.id });
  const { subcategories, getSubcategoriesByCategoryId, refetch: refetchSubcategories } = useSubcategories({ companyId: company?.id });
  const { addProduct } = useProducts({ companyId: company?.id });
  
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'review'>('upload');
  // Track new category names suggested by AI (not yet in DB)
  const [newCategoryNames, setNewCategoryNames] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(f.type.startsWith('image/') ? URL.createObjectURL(f) : null);
    setStep('preview');
  }

  async function handleExtract() {
    if (!file || !company?.id) return;
    setIsExtracting(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `menu-import/${company.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      const { data, error } = await supabase.functions.invoke('extract-menu', {
        body: {
          imageUrl: publicUrl,
          fileType: file.type,
          existingCategories: categories.map(c => ({ id: c.id, name: c.name })),
          existingSubcategories: subcategories.map(s => ({ id: s.id, name: s.name, categoryId: s.categoryId })),
        }
      });

      if (error) throw error;
      
      if (data?.products && Array.isArray(data.products)) {
        const newCats: string[] = [];
        const mapped: ExtractedProduct[] = data.products.map((p: any) => {
          const isNew = p.is_new_category === true && !categories.find(c => c.name === p.category);
          if (isNew && p.category && !newCats.includes(p.category)) {
            newCats.push(p.category);
          }
          return {
            name: p.name || '',
            price: parseFloat(p.price) || 0,
            category: p.category || 'Geral',
            categoryId: p.category_id || null,
            subcategoryId: p.subcategory_id || null,
            description: p.description || '',
            isNewCategory: isNew,
          };
        });
        setNewCategoryNames(newCats);
        setExtractedProducts(mapped);
        setStep('review');
        toast.success(`${mapped.length} produtos encontrados!`);
      } else {
        toast.error('Não foi possível extrair produtos do arquivo');
      }
    } catch (error: any) {
      console.error('Error extracting menu:', error);
      toast.error(error.message || 'Erro ao processar arquivo');
    } finally {
      setIsExtracting(false);
    }
  }

  function removeProduct(index: number) {
    setExtractedProducts(prev => prev.filter((_, i) => i !== index));
  }

  function updateProduct(index: number, field: keyof ExtractedProduct, value: string | number | boolean | null) {
    setExtractedProducts(prev => prev.map((p, i) => {
      if (i !== index) return p;
      const updated = { ...p, [field]: value };
      // When category changes, reset subcategory
      if (field === 'categoryId') {
        updated.subcategoryId = null;
        const cat = categories.find(c => c.id === value);
        if (cat) {
          updated.category = cat.name;
          updated.isNewCategory = false;
        }
      }
      if (field === 'category') {
        // Check if it matches an existing category
        const cat = categories.find(c => c.name === value);
        if (cat) {
          updated.categoryId = cat.id;
          updated.isNewCategory = false;
        } else {
          updated.categoryId = null;
          updated.isNewCategory = true;
          if (typeof value === 'string' && value && !newCategoryNames.includes(value)) {
            setNewCategoryNames(prev => [...prev, value]);
          }
        }
        updated.subcategoryId = null;
      }
      return updated;
    }));
  }

  function addEmptyProduct() {
    setExtractedProducts(prev => [...prev, {
      name: '',
      price: 0,
      category: categories[0]?.name || 'Geral',
      categoryId: categories[0]?.id || null,
      subcategoryId: null,
      description: '',
      isNewCategory: false,
    }]);
  }

  // Build category options: existing + new ones from AI
  function getCategoryOptions() {
    const options = categories.map(c => ({ id: c.id, name: c.name, isNew: false }));
    for (const name of newCategoryNames) {
      if (!options.find(o => o.name === name)) {
        options.push({ id: `new-${name}`, name, isNew: true });
      }
    }
    return options;
  }

  function getSubcategoryOptions(categoryId: string | null) {
    if (!categoryId || categoryId.startsWith('new-')) return [];
    return getSubcategoriesByCategoryId(categoryId);
  }

  async function handleImport() {
    if (extractedProducts.length === 0) {
      toast.error('Adicione pelo menos um produto');
      return;
    }

    // Validate all products have names and categories
    const invalid = extractedProducts.find(p => !p.name.trim() || !p.category.trim());
    if (invalid) {
      toast.error('Todos os produtos precisam ter nome e categoria');
      return;
    }

    setIsImporting(true);
    let successCount = 0;

    try {
      // Create new categories first and map their IDs
      const categoryMap = new Map<string, string>(); // name -> id
      categories.forEach(c => categoryMap.set(c.name, c.id));

      for (const product of extractedProducts) {
        if (product.isNewCategory && product.category && !categoryMap.has(product.category)) {
          const success = await addCategory(product.category);
          if (success) {
            // Refetch to get the new ID
            await refetchCategories();
          }
        }
      }

      // Refetch categories to get all new IDs
      await refetchCategories();
      
      // Wait a moment for state to update, then get fresh categories
      const { data: freshCats } = await supabase
        .from('categories')
        .select('id, name')
        .eq('company_id', company!.id)
        .eq('active', true);
      
      const freshCatMap = new Map<string, string>();
      (freshCats || []).forEach(c => freshCatMap.set(c.name, c.id));

      for (const product of extractedProducts) {
        try {
          const catId = product.categoryId && !product.categoryId.startsWith('new-') 
            ? product.categoryId 
            : freshCatMap.get(product.category) || null;
          
          await addProduct({
            name: product.name,
            price: product.price,
            category: product.category,
            description: product.description || undefined,
            active: true,
            subcategoryId: product.subcategoryId,
          } as any);
          successCount++;
        } catch (err) {
          console.error('Error adding product:', product.name, err);
        }
      }

      toast.success(`${successCount} produtos importados com sucesso!`);
      reset();
    } catch {
      toast.error('Erro ao importar produtos');
    } finally {
      setIsImporting(false);
    }
  }

  function reset() {
    setFile(null);
    setPreviewUrl(null);
    setExtractedProducts([]);
    setNewCategoryNames([]);
    setStep('upload');
  }

  const categoryOptions = getCategoryOptions();

  return (
    <AppLayout title="Importar Cardápio">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Step: Upload */}
        {step === 'upload' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileImage className="w-5 h-5" />
                Importar por Foto ou Arquivo
              </CardTitle>
              <CardDescription>
                Envie uma foto ou arquivo do seu cardápio e nosso sistema irá extrair os produtos automaticamente.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <input
                type="file"
                accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
                ref={fileInputRef}
                onChange={handleFileSelect}
                className="hidden"
              />
              <div 
                className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-12 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                <p className="text-lg font-medium">Clique para selecionar ou arraste o arquivo</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Formatos aceitos: JPG, PNG, WEBP, PDF
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Preview */}
        {step === 'preview' && file && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Eye className="w-5 h-5" />
                Preview do Arquivo
              </CardTitle>
              <CardDescription>
                Confirme que o arquivo está legível antes de processar
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewUrl ? (
                <div className="max-h-96 overflow-auto rounded border">
                  <img src={previewUrl} alt="Preview" className="w-full" />
                </div>
              ) : (
                <div className="bg-muted p-6 rounded-lg text-center">
                  <FileImage className="w-12 h-12 mx-auto text-muted-foreground mb-2" />
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</p>
                </div>
              )}
              <div className="flex gap-3">
                <Button variant="outline" onClick={reset}>Cancelar</Button>
                <Button onClick={handleExtract} disabled={isExtracting} className="gap-2">
                  {isExtracting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Processando com IA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Extrair Produtos
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Check className="w-5 h-5" />
                Revisar Produtos Extraídos
              </CardTitle>
              <CardDescription>
                {extractedProducts.length} produtos encontrados. Revise, edite e confirme antes de salvar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[60vh]">
                <div className="space-y-3 pr-4">
                  {extractedProducts.map((product, index) => {
                    const subcatOptions = getSubcategoryOptions(product.categoryId);
                    return (
                      <div key={index} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                            {product.isNewCategory && (
                              <Badge variant="secondary" className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 text-xs">
                                <Sparkles className="w-3 h-3 mr-1" />
                                Nova categoria
                              </Badge>
                            )}
                          </div>
                          <Button variant="ghost" size="icon" onClick={() => removeProduct(index)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div className="sm:col-span-2">
                            <Label className="text-xs">Nome</Label>
                            <Input
                              value={product.name}
                              onChange={(e) => updateProduct(index, 'name', e.target.value)}
                              className="h-9"
                              placeholder="Nome do produto"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Preço (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={product.price}
                              onChange={(e) => updateProduct(index, 'price', parseFloat(e.target.value) || 0)}
                              className="h-9"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <Label className="text-xs">Categoria</Label>
                            <Select
                              value={product.categoryId || `new-${product.category}`}
                              onValueChange={(val) => {
                                if (val.startsWith('new-')) {
                                  const catName = val.replace('new-', '');
                                  updateProduct(index, 'category', catName);
                                } else {
                                  updateProduct(index, 'categoryId', val);
                                }
                              }}
                            >
                              <SelectTrigger className="h-9">
                                <SelectValue placeholder="Selecione a categoria" />
                              </SelectTrigger>
                              <SelectContent>
                                {categoryOptions.map(opt => (
                                  <SelectItem key={opt.id} value={opt.id}>
                                    {opt.name} {opt.isNew && '✨ nova'}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="text-xs">Subcategoria</Label>
                            {subcatOptions.length > 0 ? (
                              <Select
                                value={product.subcategoryId || 'none'}
                                onValueChange={(val) => updateProduct(index, 'subcategoryId', val === 'none' ? null : val)}
                              >
                                <SelectTrigger className="h-9">
                                  <SelectValue placeholder="Selecione" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">Nenhuma</SelectItem>
                                  {subcatOptions.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <Input className="h-9" disabled placeholder="Sem subcategorias" />
                            )}
                          </div>
                        </div>

                        <div>
                          <Label className="text-xs">Descrição</Label>
                          <Input
                            value={product.description}
                            onChange={(e) => updateProduct(index, 'description', e.target.value)}
                            className="h-9"
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>

              <Button variant="outline" onClick={addEmptyProduct} className="w-full gap-2">
                <Plus className="w-4 h-4" />
                Adicionar produto manualmente
              </Button>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {extractedProducts.length} produto(s)
                  {newCategoryNames.length > 0 && (
                    <span className="ml-2 text-amber-600">
                      • {newCategoryNames.length} nova(s) categoria(s)
                    </span>
                  )}
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset}>Cancelar</Button>
                  <Button 
                    onClick={handleImport} 
                    disabled={isImporting || extractedProducts.length === 0}
                    className="gap-2"
                  >
                    {isImporting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Importando...
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        Confirmar e Criar Produtos
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
