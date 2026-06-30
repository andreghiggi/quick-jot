import { useState, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCategories } from '@/hooks/useCategories';
import { useSubcategories } from '@/hooks/useSubcategories';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRules } from '@/hooks/useTaxRules';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Upload, Loader2, Eye, Check, FileImage, Trash2, Plus, Sparkles, AlertTriangle, Wand2 } from 'lucide-react';

interface ExtractedProduct {
  name: string;
  price: number;
  category: string;
  categoryId: string | null;
  subcategoryId: string | null;
  description: string;
  isNewCategory: boolean;
  // ---- Fase 1: visibilidade / tipo / tributação / custo ----
  productType: 'cardapio' | 'mercado' | 'ambos';
  taxRuleId: string | null;
  pdvItem: boolean;
  menuItem: boolean;
  waiterItem: boolean;
  qrItem: boolean;
  active: boolean;
  costPrice: number | null;
  unit: string;
  // ---- Fase 2: campos de Mercado (gating por productType) ----
  gtin: string;
  ncm: string;
  cfop: string;
  cest: string;
  trackStock: boolean;
  stockQuantity: number;
  minStock: number;
  sellByWeight: boolean;
  // ---- UI ----
  selected: boolean;
}

function applyVisibilityFromType(t: 'cardapio' | 'mercado' | 'ambos') {
  if (t === 'mercado') return { pdvItem: true, menuItem: false, waiterItem: false, qrItem: false };
  if (t === 'ambos') return { pdvItem: true, menuItem: true, waiterItem: true, qrItem: true };
  return { pdvItem: true, menuItem: true, waiterItem: true, qrItem: true };
}

export default function MenuImport() {
  const { company } = useAuthContext();
  const { categories, addCategory, refetch: refetchCategories } = useCategories({ companyId: company?.id });
  const { subcategories, getSubcategoriesByCategoryId, refetch: refetchSubcategories } = useSubcategories({ companyId: company?.id });
  const { addProduct } = useProducts({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });
  
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [extractedProducts, setExtractedProducts] = useState<ExtractedProduct[]>([]);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isApplyingFiscalAI, setIsApplyingFiscalAI] = useState(false);
  const [step, setStep] = useState<'upload' | 'preview' | 'review'>('upload');
  const [newCategoryNames, setNewCategoryNames] = useState<string[]>([]);
  // ---- Ações em massa ----
  const [bulkTaxRuleId, setBulkTaxRuleId] = useState<string>('');
  const [bulkType, setBulkType] = useState<'cardapio' | 'mercado' | 'ambos' | ''>('');
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
          const type = (['cardapio','mercado','ambos'].includes(p.suggested_type) ? p.suggested_type : 'cardapio') as 'cardapio'|'mercado'|'ambos';
          const vis = applyVisibilityFromType(type);
          return {
            name: p.name || '',
            price: parseFloat(p.price) || 0,
            category: p.category || 'Geral',
            categoryId: p.category_id || null,
            subcategoryId: p.subcategory_id || null,
            description: p.description || '',
            isNewCategory: isNew,
            productType: type,
            taxRuleId: null,
            ...vis,
            active: true,
            costPrice: null,
            unit: (typeof p.suggested_unit === 'string' && p.suggested_unit) ? p.suggested_unit : 'UN',
            gtin: '',
            ncm: typeof p.ncm_suggestion === 'string' ? p.ncm_suggestion : '',
            cfop: type !== 'cardapio' ? '5102' : '',
            cest: '',
            trackStock: false,
            stockQuantity: 0,
            minStock: 0,
            sellByWeight: false,
            selected: false,
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

  function updateProduct(index: number, field: keyof ExtractedProduct, value: any) {
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
      // Quando muda o Tipo, ressincroniza visibilidade default e CFOP base
      if (field === 'productType') {
        const vis = applyVisibilityFromType(value as any);
        updated.pdvItem = vis.pdvItem;
        updated.menuItem = vis.menuItem;
        updated.waiterItem = vis.waiterItem;
        updated.qrItem = vis.qrItem;
        if (value !== 'cardapio' && !updated.cfop) updated.cfop = '5102';
      }
      return updated;
    }));
  }

  function addEmptyProduct() {
    const vis = applyVisibilityFromType('cardapio');
    setExtractedProducts(prev => [...prev, {
      name: '',
      price: 0,
      category: categories[0]?.name || 'Geral',
      categoryId: categories[0]?.id || null,
      subcategoryId: null,
      description: '',
      isNewCategory: false,
      productType: 'cardapio',
      taxRuleId: null,
      ...vis,
      active: true,
      costPrice: null,
      unit: 'UN',
      gtin: '',
      ncm: '',
      cfop: '',
      cest: '',
      trackStock: false,
      stockQuantity: 0,
      minStock: 0,
      sellByWeight: false,
      selected: false,
    }]);
  }

  // ---- Ações em massa ----
  const anySelected = extractedProducts.some(p => p.selected);
  function toggleSelectAll(checked: boolean) {
    setExtractedProducts(prev => prev.map(p => ({ ...p, selected: checked })));
  }
  function applyToScope(updater: (p: ExtractedProduct) => Partial<ExtractedProduct>) {
    setExtractedProducts(prev => prev.map(p => {
      if (anySelected && !p.selected) return p;
      return { ...p, ...updater(p) };
    }));
  }
  function bulkApplyTaxRule() {
    if (!bulkTaxRuleId) { toast.error('Selecione uma regra'); return; }
    applyToScope(() => ({ taxRuleId: bulkTaxRuleId }));
    toast.success('Regra tributária aplicada');
  }
  function bulkApplyType() {
    if (!bulkType) { toast.error('Selecione um tipo'); return; }
    applyToScope(() => {
      const vis = applyVisibilityFromType(bulkType as any);
      return { productType: bulkType as any, ...vis, cfop: bulkType !== 'cardapio' ? '5102' : '' };
    });
    toast.success('Tipo aplicado');
  }
  function bulkToggleActive(active: boolean) {
    applyToScope(() => ({ active }));
  }
  function bulkRemove() {
    setExtractedProducts(prev => prev.filter(p => !p.selected));
  }

  async function handleApplyFiscalAI() {
    if (extractedProducts.length === 0) return;
    const scope = extractedProducts.filter(p => (anySelected ? p.selected : true) && p.name.trim());
    if (scope.length === 0) { toast.error('Sem produtos para enriquecer'); return; }
    setIsApplyingFiscalAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('extract-menu', {
        body: { mode: 'fiscal_only', productNames: scope.map(p => p.name) },
      });
      if (error) throw error;
      const suggestions: any[] = data?.suggestions || [];
      const byName = new Map<string, any>();
      suggestions.forEach(s => { if (s?.name) byName.set(String(s.name).toLowerCase().trim(), s); });
      setExtractedProducts(prev => prev.map(p => {
        if (anySelected && !p.selected) return p;
        const s = byName.get(p.name.toLowerCase().trim());
        if (!s) return p;
        const type = (['cardapio','mercado','ambos'].includes(s.suggested_type) ? s.suggested_type : p.productType) as 'cardapio'|'mercado'|'ambos';
        const vis = applyVisibilityFromType(type);
        return {
          ...p,
          productType: type,
          ...vis,
          unit: (typeof s.suggested_unit === 'string' && s.suggested_unit) ? s.suggested_unit : p.unit,
          ncm: (!p.ncm && typeof s.ncm_suggestion === 'string') ? s.ncm_suggestion : p.ncm,
          cfop: (type !== 'cardapio' && !p.cfop) ? '5102' : p.cfop,
        };
      }));
      toast.success('IA fiscal aplicada');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao aplicar IA fiscal');
    } finally {
      setIsApplyingFiscalAI(false);
    }
  }

  async function handleGenerateGtin(index: number) {
    if (!company?.id) return;
    const { data, error } = await supabase.rpc('generate_internal_ean13', { _company_id: company.id });
    if (error) { toast.error('Erro ao gerar EAN'); return; }
    if (typeof data === 'string') updateProduct(index, 'gtin', data);
  }

  // ---- Validação por linha ----
  function rowIssues(p: ExtractedProduct): { level: 'error' | 'warn'; label: string }[] {
    const out: { level: 'error' | 'warn'; label: string }[] = [];
    if (!p.name.trim()) out.push({ level: 'error', label: 'Sem nome' });
    if (!p.price || p.price <= 0) out.push({ level: 'error', label: 'Definir preço' });
    if (p.productType !== 'cardapio' && !p.ncm.trim()) out.push({ level: 'warn', label: 'Revisar fiscal' });
    if (!p.taxRuleId) out.push({ level: 'warn', label: 'Sem tributação' });
    return out;
  }
  function hasBlockingError(p: ExtractedProduct) {
    return rowIssues(p).some(i => i.level === 'error');
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

    // Import parcial: separa válidos × inválidos. Inválidos PERMANECEM no grid com badge.
    const valid = extractedProducts.filter(p => !hasBlockingError(p) && p.category.trim());
    const invalid = extractedProducts.filter(p => hasBlockingError(p) || !p.category.trim());
    if (valid.length === 0) {
      toast.error('Nenhum produto válido para importar. Corrija os erros marcados em vermelho.');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    const failed: ExtractedProduct[] = [];

    try {
      // Create new categories first and map their IDs
      const categoryMap = new Map<string, string>(); // name -> id
      categories.forEach(c => categoryMap.set(c.name, c.id));

      for (const product of valid) {
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

      for (const product of valid) {
        try {
          const catId = product.categoryId && !product.categoryId.startsWith('new-') 
            ? product.categoryId 
            : freshCatMap.get(product.category) || null;
          
          const newId = await addProduct({
            name: product.name,
            price: product.price,
            category: product.category,
            description: product.description || undefined,
            active: product.active,
            subcategoryId: product.subcategoryId,
            productType: product.productType,
            taxRuleId: product.taxRuleId,
            pdvItem: product.pdvItem,
            menuItem: product.menuItem,
            waiterItem: product.waiterItem,
            qrItem: product.qrItem,
            costPrice: product.costPrice ?? null,
            unit: product.unit || 'UN',
            gtin: product.gtin || null,
            ncm: product.ncm || null,
            cfop: product.cfop || null,
            cest: product.cest || null,
            trackStock: product.trackStock,
            minStock: product.minStock || 0,
            sellByWeight: product.sellByWeight,
          } as any);
          // Estoque inicial via movimentação (mantém histórico)
          if (newId && product.trackStock && product.stockQuantity > 0) {
            try {
              await supabase.rpc('apply_stock_movement', {
                _product_id: newId,
                _qty: product.stockQuantity,
                _type: 'entrada',
                _reference_type: 'menu_import',
                _reference_id: null,
                _notes: 'Estoque inicial via Importar Cardápio',
              });
            } catch (e) {
              console.warn('Falha no estoque inicial', product.name, e);
            }
          }
          successCount++;
        } catch (err) {
          console.error('Error adding product:', product.name, err);
          failed.push(product);
        }
      }

      if (successCount > 0) {
        toast.success(`${successCount} produto(s) importado(s) com sucesso!`);
      }
      const remaining = [...invalid, ...failed];
      if (remaining.length > 0) {
        toast.warning(`${remaining.length} produto(s) com pendências permanecem no grid para revisão.`);
        setExtractedProducts(remaining);
      } else {
        reset();
      }
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
  const selectedCount = extractedProducts.filter(p => p.selected).length;

  return (
    <AppLayout title="Importar Cardápio">
      <div className="max-w-6xl mx-auto space-y-6">
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
              {/* Barra de ações em massa */}
              <div className="rounded-lg border bg-muted/40 p-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Checkbox
                    checked={extractedProducts.length > 0 && extractedProducts.every(p => p.selected)}
                    onCheckedChange={(v) => toggleSelectAll(!!v)}
                  />
                  <span className="text-xs text-muted-foreground">
                    {selectedCount > 0 ? `${selectedCount} selecionado(s) — ações aplicam apenas aos selecionados` : 'Nenhum selecionado — ações aplicam a todos'}
                  </span>
                </div>
                <div className="flex flex-wrap items-end gap-2">
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-xs">Regra tributária</Label>
                      <Select value={bulkTaxRuleId} onValueChange={setBulkTaxRuleId}>
                        <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          {taxRules.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="secondary" onClick={bulkApplyTaxRule}>Aplicar</Button>
                  </div>
                  <div className="flex items-end gap-2">
                    <div>
                      <Label className="text-xs">Tipo do produto</Label>
                      <Select value={bulkType} onValueChange={(v) => setBulkType(v as any)}>
                        <SelectTrigger className="h-9 w-40"><SelectValue placeholder="Selecione..." /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cardapio">Cardápio</SelectItem>
                          <SelectItem value="mercado">Mercado</SelectItem>
                          <SelectItem value="ambos">Ambos</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <Button size="sm" variant="secondary" onClick={bulkApplyType}>Aplicar</Button>
                  </div>
                  <div className="flex gap-2 ml-auto">
                    <Button size="sm" variant="outline" onClick={() => bulkToggleActive(true)}>Ativar</Button>
                    <Button size="sm" variant="outline" onClick={() => bulkToggleActive(false)}>Desativar</Button>
                    <Button size="sm" variant="outline" onClick={handleApplyFiscalAI} disabled={isApplyingFiscalAI} className="gap-1">
                      {isApplyingFiscalAI ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wand2 className="w-3 h-3" />}
                      IA fiscal
                    </Button>
                    {selectedCount > 0 && (
                      <Button size="sm" variant="destructive" onClick={bulkRemove} className="gap-1">
                        <Trash2 className="w-3 h-3" /> Remover
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <ScrollArea className="h-[60vh]">
                <div className="space-y-3 pr-4">
                  {extractedProducts.map((product, index) => {
                    const subcatOptions = getSubcategoryOptions(product.categoryId);
                    const issues = rowIssues(product);
                    const isMercadoLike = product.productType !== 'cardapio';
                    return (
                      <div key={index} className={`border rounded-lg p-4 space-y-3 ${hasBlockingError(product) ? 'border-destructive/60' : ''}`}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Checkbox
                              checked={product.selected}
                              onCheckedChange={(v) => updateProduct(index, 'selected', !!v)}
                            />
                            <span className="text-sm font-medium text-muted-foreground">#{index + 1}</span>
                            {product.isNewCategory && (
                              <Badge variant="secondary" className="bg-accent text-accent-foreground text-xs">
                                <Sparkles className="w-3 h-3 mr-1" />
                                Nova categoria
                              </Badge>
                            )}
                            {issues.map((iss, i) => (
                              <Badge
                                key={i}
                                variant={iss.level === 'error' ? 'destructive' : 'secondary'}
                                className="text-xs gap-1"
                              >
                                <AlertTriangle className="w-3 h-3" />
                                {iss.label}
                              </Badge>
                            ))}
                          </div>
                          <div className="flex items-center gap-3">
                            <label className="flex items-center gap-2 text-xs">
                              <Switch checked={product.active} onCheckedChange={(v) => updateProduct(index, 'active', v)} />
                              Ativo
                            </label>
                            <Button variant="ghost" size="icon" onClick={() => removeProduct(index)}>
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-6 gap-3">
                          <div className="sm:col-span-3">
                            <Label className="text-xs">Nome</Label>
                            <Input
                              value={product.name}
                              onChange={(e) => updateProduct(index, 'name', e.target.value)}
                              className="h-9"
                              placeholder="Nome do produto"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Preço venda (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={product.price}
                              onChange={(e) => updateProduct(index, 'price', parseFloat(e.target.value) || 0)}
                              className="h-9"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Custo (R$)</Label>
                            <Input
                              type="number"
                              step="0.01"
                              value={product.costPrice ?? ''}
                              onChange={(e) => updateProduct(index, 'costPrice', e.target.value === '' ? null : parseFloat(e.target.value))}
                              className="h-9"
                              placeholder="Opcional"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Unidade</Label>
                            <Select value={product.unit || 'UN'} onValueChange={(v) => updateProduct(index, 'unit', v)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {['UN','KG','G','L','ML','CX','PCT','DZ'].map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                          <div>
                            <Label className="text-xs">Tipo</Label>
                            <Select value={product.productType} onValueChange={(v) => updateProduct(index, 'productType', v as any)}>
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="cardapio">Cardápio</SelectItem>
                                <SelectItem value="mercado">Mercado</SelectItem>
                                <SelectItem value="ambos">Ambos</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Regra tributária</Label>
                            <Select
                              value={product.taxRuleId || 'none'}
                              onValueChange={(v) => updateProduct(index, 'taxRuleId', v === 'none' ? null : v)}
                            >
                              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem regra</SelectItem>
                                {taxRules.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
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

                        {/* Visibilidade */}
                        <div className="flex flex-wrap gap-4 text-xs">
                          <label className="flex items-center gap-2">
                            <Switch checked={product.pdvItem} onCheckedChange={(v) => updateProduct(index, 'pdvItem', v)} />
                            Visível no PDV
                          </label>
                          <label className="flex items-center gap-2">
                            <Switch checked={product.menuItem} onCheckedChange={(v) => updateProduct(index, 'menuItem', v)} />
                            Visível no Cardápio
                          </label>
                          <label className="flex items-center gap-2">
                            <Switch checked={product.waiterItem} onCheckedChange={(v) => updateProduct(index, 'waiterItem', v)} />
                            Visível no Garçom
                          </label>
                          <label className="flex items-center gap-2">
                            <Switch checked={product.qrItem} onCheckedChange={(v) => updateProduct(index, 'qrItem', v)} />
                            Visível no QR de Mesa
                          </label>
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

                        {/* Mercado: campos extras */}
                        {isMercadoLike && (
                          <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/30">
                            <div className="text-xs font-medium text-muted-foreground">Campos de Mercado (fiscal/estoque)</div>
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div className="sm:col-span-2">
                                <Label className="text-xs">GTIN / EAN</Label>
                                <div className="flex gap-2">
                                  <Input
                                    value={product.gtin}
                                    onChange={(e) => updateProduct(index, 'gtin', e.target.value)}
                                    className="h-9"
                                    placeholder="Sem GTIN"
                                  />
                                  <Button type="button" size="sm" variant="outline" onClick={() => handleGenerateGtin(index)}>
                                    Gerar
                                  </Button>
                                </div>
                              </div>
                              <div>
                                <Label className="text-xs">NCM</Label>
                                <Input
                                  value={product.ncm}
                                  onChange={(e) => updateProduct(index, 'ncm', e.target.value)}
                                  className="h-9"
                                  placeholder="8 dígitos"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">CFOP</Label>
                                <Input
                                  value={product.cfop}
                                  onChange={(e) => updateProduct(index, 'cfop', e.target.value)}
                                  className="h-9"
                                  placeholder="5102"
                                />
                              </div>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                              <div>
                                <Label className="text-xs">CEST</Label>
                                <Input
                                  value={product.cest}
                                  onChange={(e) => updateProduct(index, 'cest', e.target.value)}
                                  className="h-9"
                                  placeholder="Opcional"
                                />
                              </div>
                              <label className="flex items-center gap-2 text-xs pt-5">
                                <Switch checked={product.trackStock} onCheckedChange={(v) => updateProduct(index, 'trackStock', v)} />
                                Controla estoque
                              </label>
                              {product.trackStock && (
                                <>
                                  <div>
                                    <Label className="text-xs">Estoque mínimo</Label>
                                    <Input
                                      type="number"
                                      step="1"
                                      value={product.minStock}
                                      onChange={(e) => updateProduct(index, 'minStock', parseFloat(e.target.value) || 0)}
                                      className="h-9"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs">Estoque inicial</Label>
                                    <Input
                                      type="number"
                                      step="0.001"
                                      value={product.stockQuantity}
                                      onChange={(e) => updateProduct(index, 'stockQuantity', parseFloat(e.target.value) || 0)}
                                      className="h-9"
                                    />
                                  </div>
                                </>
                              )}
                              <label className="flex items-center gap-2 text-xs pt-5">
                                <Switch checked={product.sellByWeight} onCheckedChange={(v) => updateProduct(index, 'sellByWeight', v)} />
                                Vender por peso
                              </label>
                            </div>
                          </div>
                        )}
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
                    <span className="ml-2 text-accent-foreground">
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
