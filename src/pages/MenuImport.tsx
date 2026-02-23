import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Upload, Loader2, Eye, Check, X, FileImage, Trash2 } from 'lucide-react';

interface ExtractedProduct {
  name: string;
  price: number;
  category: string;
  description?: string;
  selected: boolean;
}

export default function MenuImport() {
  const { company } = useAuthContext();
  const { categories, addCategory } = useCategories({ companyId: company?.id });
  const { addProduct } = useProducts({ companyId: company?.id });
  
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'review'>('upload');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    
    if (f.type.startsWith('image/')) {
      setPreviewUrl(URL.createObjectURL(f));
    } else {
      setPreviewUrl(null);
    }
    setStep('preview');
  }

  async function handleExtract() {
    if (!file || !company?.id) return;
    setIsExtracting(true);

    try {
      // Upload the file to storage for AI to process
      const fileExt = file.name.split('.').pop();
      const fileName = `menu-import/${company.id}/${Date.now()}.${fileExt}`;
      
      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(fileName, file);
      
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('product-images')
        .getPublicUrl(fileName);

      // Use AI to extract products
      const { data, error } = await supabase.functions.invoke('extract-menu', {
        body: { imageUrl: publicUrl, fileType: file.type }
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
        setStep('review');
        toast.success(`${data.products.length} produtos encontrados!`);
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

  function toggleProduct(index: number) {
    setExtractedProducts(prev => prev.map((p, i) => 
      i === index ? { ...p, selected: !p.selected } : p
    ));
  }

  function removeProduct(index: number) {
    setExtractedProducts(prev => prev.filter((_, i) => i !== index));
  }

  function updateProduct(index: number, field: keyof ExtractedProduct, value: string | number) {
    setExtractedProducts(prev => prev.map((p, i) => 
      i === index ? { ...p, [field]: value } : p
    ));
  }

  async function handleImport() {
    const selected = extractedProducts.filter(p => p.selected);
    if (selected.length === 0) {
      toast.error('Selecione pelo menos um produto');
      return;
    }

    setIsImporting(true);
    let successCount = 0;

    try {
      // Create missing categories first
      const existingCatNames = categories.map(c => c.name);
      const newCategories = [...new Set(selected.map(p => p.category))].filter(c => !existingCatNames.includes(c));
      
      for (const catName of newCategories) {
        await addCategory(catName);
      }

      // Add products
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

      toast.success(`${successCount} produtos importados com sucesso!`);
      setStep('upload');
      setFile(null);
      setPreviewUrl(null);
      setExtractedProducts([]);
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
    setStep('upload');
  }

  const selectedCount = extractedProducts.filter(p => p.selected).length;

  return (
    <AppLayout title="Importar Cardápio">
      <div className="max-w-3xl mx-auto space-y-6">
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
                Você poderá revisar antes de confirmar a inclusão.
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
              {previewUrl && (
                <div className="max-h-96 overflow-auto rounded border">
                  <img src={previewUrl} alt="Preview" className="w-full" />
                </div>
              )}
              {!previewUrl && (
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
                      <Eye className="w-4 h-4" />
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
                {extractedProducts.length} produtos encontrados. Revise, edite e selecione quais deseja importar.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ScrollArea className="h-[60vh]">
                <div className="space-y-3">
                  {extractedProducts.map((product, index) => (
                    <div 
                      key={index} 
                      className={`border rounded-lg p-4 space-y-3 transition-opacity ${!product.selected ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Checkbox 
                            checked={product.selected} 
                            onCheckedChange={() => toggleProduct(index)}
                          />
                          <Badge variant="outline">{product.category}</Badge>
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
                          <Input
                            value={product.category}
                            onChange={(e) => updateProduct(index, 'category', e.target.value)}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs">Descrição</Label>
                          <Input
                            value={product.description || ''}
                            onChange={(e) => updateProduct(index, 'description', e.target.value)}
                            className="h-9"
                            placeholder="Opcional"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-muted-foreground">
                  {selectedCount} de {extractedProducts.length} selecionados
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={reset}>Cancelar</Button>
                  <Button 
                    onClick={handleImport} 
                    disabled={isImporting || selectedCount === 0}
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
                        Importar {selectedCount} Produtos
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
