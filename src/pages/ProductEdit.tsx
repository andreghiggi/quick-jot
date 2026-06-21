import { useParams, useNavigate, Navigate, Link, useSearchParams } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ArrowLeft, Camera, ChevronDown, ExternalLink, Loader2, Plus, UtensilsCrossed, ShoppingCart, Repeat, X } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useSubcategories } from '@/hooks/useSubcategories';
import { useTaxRules } from '@/hooks/useTaxRules';
import { useOptionalGroups } from '@/hooks/useOptionalGroups';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { supabase } from '@/integrations/supabase/client';
import { uploadCompressedImage } from '@/utils/imageUtils';
import { lookupCestByNcm, type CestMatch } from '@/utils/cestLookup';
import { applyStockMovementOnce } from '@/hooks/useStockMovements';
import { toast } from 'sonner';

/**
 * Página de cadastro/edição de produto.
 *
 * Rotas:
 *   /produtos/novo   → cadastro
 *   /produtos/:id    → edição
 *
 * Layout estilo Gweb: tudo numa única página rolando, sem blocos
 * colapsáveis. Botões CANCELAR / SALVAR no rodapé.
 */
export default function ProductEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { company } = useAuthContext();
  const { products, loading, addProduct, updateProduct } = useProducts({ companyId: company?.id });
  const { categories, addCategory } = useCategories({ companyId: company?.id });
  const { subcategories } = useSubcategories({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });
  const { groups: optionalGroups } = useOptionalGroups({ companyId: company?.id });
  const { isModuleEnabled } = useCompanyModules({ companyId: company?.id });

  const isNew = !id || id === 'novo';
  const existing = useMemo(
    () => (isNew ? null : products.find((p) => p.id === id) ?? null),
    [products, id, isNew],
  );

  const mercadoEnabled = isModuleEnabled('mercado');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Tipo do produto (cardapio / mercado / ambos). Define UX e visibilidade automática.
  // Quando a loja NÃO tem o módulo Mercado, todo produto é tratado como `cardapio` (UX antiga).
  const initialTypeFromUrl = (() => {
    const t = searchParams.get('tipo');
    return t === 'mercado' || t === 'ambos' || t === 'cardapio' ? t : null;
  })();
  const [productType, setProductType] = useState<'cardapio' | 'mercado' | 'ambos'>(
    initialTypeFromUrl || 'cardapio',
  );

  // ---------- form state ----------
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [subcategoryId, setSubcategoryId] = useState<string>('');
  const [active, setActive] = useState(true);
  const [menuItem, setMenuItem] = useState(true);
  const [pdvItem, setPdvItem] = useState(true);
  const [waiterItem, setWaiterItem] = useState(true);
  const [isFeatured, setIsFeatured] = useState(false);
  const [code, setCode] = useState('');
  const [gtin, setGtin] = useState('');
  const [unit, setUnit] = useState('UN');
  const [costPrice, setCostPrice] = useState('');
  const [price, setPrice] = useState('');
  const [icmsOrigin, setIcmsOrigin] = useState('0');
  const [taxRuleId, setTaxRuleId] = useState<string>('');
  // Estoque sempre controlado quando módulo `mercado` está ativo (Gweb-style).
  // O toggle "Controlar estoque" foi removido conforme decisão de produto.
  const [stockQuantity, setStockQuantity] = useState('');
  const [minStock, setMinStock] = useState('');
  // ---- Fiscal (Fase C) ----
  const [ncm, setNcm] = useState('');
  const [cest, setCest] = useState('');
  const [cestSuggestions, setCestSuggestions] = useState<CestMatch[]>([]);
  const [cfop, setCfop] = useState('');
  // ---- Mercado: comercial ----
  const [brand, setBrand] = useState('');
  const [supplierId, setSupplierId] = useState<string>('');
  const [wholesalePrice, setWholesalePrice] = useState('');
  const [wholesaleMinQty, setWholesaleMinQty] = useState('');
  // ---- Mercado: validade / lote ----
  const [shelfLifeDays, setShelfLifeDays] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [batchNumber, setBatchNumber] = useState('');
  // ---- Mercado: balança ----
  const [isScaleItem, setIsScaleItem] = useState(false);
  const [scaleBarcode, setScaleBarcode] = useState('');
  const [pricePerKg, setPricePerKg] = useState(false);
  // Lista de fornecedores (para o select). Só carrega se módulo Mercado ativo.
  const [suppliersList, setSuppliersList] = useState<Array<{ id: string; name: string }>>([]);
  // Snapshot do estoque atual no carregamento — usado para detectar ajuste manual na edição.
  const [originalStock, setOriginalStock] = useState<number>(0);
  // Confirmação de ajuste de estoque antes de salvar
  const [stockConfirmOpen, setStockConfirmOpen] = useState(false);
  const [pendingStockChange, setPendingStockChange] = useState<{ from: number; to: number } | null>(null);

  const [hydrated, setHydrated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [fiscalOpen, setFiscalOpen] = useState(false);
  const [visibilityAdvancedOpen, setVisibilityAdvancedOpen] = useState(false);
  // Inline "+ Nova categoria"
  const [newCategoryInline, setNewCategoryInline] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);

  // Hydrate form once the product is loaded (edit mode) or when new
  useEffect(() => {
    if (hydrated) return;
    if (isNew) {
      // Pré-seleciona a primeira categoria, se existir, para reduzir cliques
      // Exceção: tipo `mercado` deixa categoria vazia (opcional → cai em "Geral" ao salvar).
      if (categories.length > 0 && !categoryName && productType !== 'mercado') {
        setCategoryName(categories[0].name);
      }
      // Default de estoque por tipo: mercado já vem com saldo inicial 0 visível.
      if (productType === 'mercado' && stockQuantity === '') {
        setStockQuantity('0');
      }
      setHydrated(true);
      return;
    }
    if (existing) {
      setName(existing.name || '');
      setDescription(existing.description || '');
      setImageUrl(existing.imageUrl || '');
      setCategoryName(existing.category || '');
      setSubcategoryId(existing.subcategoryId || '');
      setActive(existing.active);
      setMenuItem(existing.menuItem ?? true);
      setPdvItem(existing.pdvItem ?? true);
      setWaiterItem(existing.waiterItem ?? true);
      setProductType((existing as any).productType ?? 'cardapio');
      setIsFeatured(!!existing.isNew);
      setCode(existing.code || '');
      setGtin(existing.gtin || '');
      setUnit(existing.unit || 'UN');
      setCostPrice(existing.costPrice != null ? String(existing.costPrice) : '');
      setPrice(existing.price != null ? String(existing.price) : '');
      setIcmsOrigin(existing.icmsOrigin || '0');
      setTaxRuleId(existing.taxRuleId || '');
      setStockQuantity(existing.stockQuantity != null ? String(existing.stockQuantity) : '0');
      setOriginalStock(existing.stockQuantity != null ? Number(existing.stockQuantity) : 0);
      setMinStock(existing.minStock != null ? String(existing.minStock) : '');
      setNcm(existing.ncm || '');
      setCest(existing.cest || '');
      setCfop(existing.cfop || '');
      setBrand(existing.brand || '');
      setSupplierId(existing.supplierId || '');
      setWholesalePrice(existing.wholesalePrice != null ? String(existing.wholesalePrice) : '');
      setWholesaleMinQty(existing.wholesaleMinQty != null ? String(existing.wholesaleMinQty) : '');
      setShelfLifeDays(existing.shelfLifeDays != null ? String(existing.shelfLifeDays) : '');
      setExpirationDate(existing.expirationDate || '');
      setBatchNumber(existing.batchNumber || '');
      setIsScaleItem(!!existing.isScaleItem);
      setScaleBarcode(existing.scaleBarcode || '');
      setPricePerKg(!!existing.pricePerKg);
      setHydrated(true);
    }
  }, [existing, isNew, hydrated, categories, categoryName, productType, stockQuantity]);

  // Pré-carrega o estado de "fiscal aberto" quando há valores fiscais (UX: não esconder dados já preenchidos)
  useEffect(() => {
    if (!hydrated) return;
    if (ncm || cest || cfop || taxRuleId) setFiscalOpen(true);
  }, [hydrated, ncm, cest, cfop, taxRuleId]);

  // Carrega lista de fornecedores quando módulo Mercado está ativo
  useEffect(() => {
    if (!mercadoEnabled || !company?.id) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await (supabase as any)
        .from('suppliers')
        .select('id, name')
        .eq('company_id', company.id)
        .order('name', { ascending: true });
      if (!error && !cancelled) setSuppliersList(data || []);
    })();
    return () => { cancelled = true; };
  }, [mercadoEnabled, company?.id]);

  // Edição com id inválido → volta pra lista (após carregar)
  if (!isNew && !loading && !existing) {
    return <Navigate to="/produtos" replace />;
  }

  // ---------- derived ----------
  const selectedCategory = categories.find((c) => c.name === categoryName);
  const availableSubcategories = selectedCategory
    ? subcategories.filter((s) => s.categoryId === selectedCategory.id && s.active)
    : [];

  // Margem automática
  const margin = useMemo(() => {
    const c = parseFloat(costPrice);
    const p = parseFloat(price);
    if (!c || !p || c <= 0) return null;
    return ((p - c) / p) * 100;
  }, [costPrice, price]);

  // Grupos de opcionais vinculados (via categoria ou diretamente)
  const linkedGroups = useMemo(() => {
    if (!existing && !selectedCategory) return [];
    return optionalGroups
      .filter((g) => g.active)
      .map((g) => {
        const viaProduct = existing ? g.productIds.includes(existing.id) : false;
        const viaCategory = selectedCategory ? g.categoryIds.includes(selectedCategory.id) : false;
        if (!viaProduct && !viaCategory) return null;
        const override = existing
          ? g.productOverrides.find((o) => o.productId === existing.id)
          : null;
        return {
          id: g.id,
          name: g.name,
          min: override?.minSelectOverride ?? g.minSelect,
          max: override?.maxSelectOverride ?? g.maxSelect,
          itemsCount: g.items.length,
          source: viaProduct ? 'Direto' : `Via categoria${selectedCategory ? ` "${selectedCategory.name}"` : ''}`,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [optionalGroups, existing, selectedCategory]);

  // ---------- handlers ----------
  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const fileName = `${Date.now()}.webp`;
      const result = await uploadCompressedImage(supabase, 'product-images', fileName, file);
      if (!result) throw new Error('Upload falhou');
      setImageUrl(result.publicUrl);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao enviar imagem');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  function validate(): string | null {
    if (!name.trim()) return 'Informe o nome do produto';
    if (!price || isNaN(parseFloat(price))) return 'Informe o preço de venda';
    // Categoria é opcional para tipo `mercado` — cai em "Geral" automaticamente.
    if (productType !== 'mercado' && !categoryName) return 'Selecione uma categoria';
    if (availableSubcategories.length > 0 && !subcategoryId) {
      return 'Selecione uma subcategoria';
    }
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    // Edição: se mudou o estoque atual, pede confirmação antes de salvar.
    if (!isNew && mercadoEnabled) {
      const newQty = stockQuantity !== '' ? Number(stockQuantity) : 0;
      if (!Number.isNaN(newQty) && newQty !== originalStock) {
        setPendingStockChange({ from: originalStock, to: newQty });
        setStockConfirmOpen(true);
        return;
      }
    }
    await doSave();
  }

  async function doSave() {
    setIsSaving(true);
    try {
      // Categoria automática "Geral" para itens de mercado sem categoria.
      let finalCategoryName = categoryName.trim();
      if (productType === 'mercado' && !finalCategoryName) {
        const existingGeral = categories.find((c) => c.name.toLowerCase() === 'geral');
        if (existingGeral) {
          finalCategoryName = existingGeral.name;
        } else {
          const ok = await addCategory('Geral');
          finalCategoryName = ok ? 'Geral' : (categories[0]?.name || 'Geral');
        }
      }
      // Visibilidade automática derivada do tipo.
      // Em modo avançado, o usuário pode ter ajustado os toggles manualmente — nesse caso,
      // o estado dos toggles prevalece (não sobrescrevemos se já abriu o avançado).
      const derivedMenu = productType === 'mercado' ? false : true;
      const derivedPdv = true; // produto vendável no PDV/caixa por padrão
      const derivedWaiter = productType === 'mercado' ? false : true;
      const finalMenuItem = visibilityAdvancedOpen ? menuItem : derivedMenu;
      const finalPdvItem = visibilityAdvancedOpen ? pdvItem : derivedPdv;
      const finalWaiterItem = visibilityAdvancedOpen ? waiterItem : derivedWaiter;

      const payload: any = {
        name: name.trim(),
        price: parseFloat(price),
        category: finalCategoryName,
        description: description.trim() || undefined,
        imageUrl: imageUrl || undefined,
        active,
        menuItem: finalMenuItem,
        pdvItem: finalPdvItem,
        waiterItem: finalWaiterItem,
        productType,
        subcategoryId: subcategoryId || null,
        code: code.trim() || null,
        gtin: gtin.trim() || null,
        unit: unit || 'UN',
        icmsOrigin: icmsOrigin || '0',
        costPrice: costPrice ? parseFloat(costPrice) : null,
        taxRuleId: taxRuleId || null,
        ncm: ncm.trim() || null,
        cest: cest.trim() || null,
        cfop: cfop.trim() || null,
        ...(mercadoEnabled
          ? {
              brand: brand.trim() || null,
              supplierId: supplierId || null,
              wholesalePrice: wholesalePrice ? parseFloat(wholesalePrice) : null,
              wholesaleMinQty: wholesaleMinQty ? parseFloat(wholesaleMinQty) : null,
              shelfLifeDays: shelfLifeDays ? parseInt(shelfLifeDays, 10) : null,
              expirationDate: expirationDate || null,
              batchNumber: batchNumber.trim() || null,
              isScaleItem,
              scaleBarcode: scaleBarcode.trim() || null,
              pricePerKg,
            }
          : {}),
        ...(mercadoEnabled
          ? {
              trackStock: true,
              minStock: minStock !== '' ? Number(minStock) : 0,
            }
          : {}),
      };

      if (isNew) {
        const newId = await addProduct(payload);
        if (!newId) return;
        // Estoque inicial → vira movimento `initial` para gerar histórico.
        if (mercadoEnabled) {
          const initialQty = stockQuantity !== '' ? Number(stockQuantity) : 0;
          if (initialQty > 0) {
            await applyStockMovementOnce({
              productId: newId,
              quantity: initialQty,
              type: 'initial',
              notes: 'Estoque inicial no cadastro',
            });
          }
        }
        // Destaque (toggle is_new) é gerenciado em uma chamada separada;
        // não é crítico no cadastro, e tem limite de 5 — então fica para edição.
        navigate('/produtos');
      } else if (existing) {
        const ok = await updateProduct(existing.id, payload);
        if (!ok) return;
        // Ajuste de estoque, quando o usuário confirmou a alteração.
        if (mercadoEnabled) {
          const newQty = stockQuantity !== '' ? Number(stockQuantity) : 0;
          const delta = newQty - originalStock;
          if (delta !== 0) {
            await applyStockMovementOnce({
              productId: existing.id,
              quantity: delta,
              type: 'adjustment',
              notes: `Ajuste manual: ${originalStock} → ${newQty} (cadastro de produto)`,
            });
          }
        }
        // Atualiza destaque se mudou (chamada separada por ter limite)
        if (!!existing.isNew !== isFeatured) {
          await supabase
            .from('products')
            .update({ is_new: isFeatured } as any)
            .eq('id', existing.id);
        }
        navigate('/produtos');
      }
    } finally {
      setIsSaving(false);
      setStockConfirmOpen(false);
      setPendingStockChange(null);
    }
  }

  const title = isNew ? 'Novo produto' : existing?.name || 'Editar produto';

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate('/produtos')}
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold truncate">{title}</h1>
        </div>

        {/* ===================== IDENTIFICAÇÃO ===================== */}
        <Section title="Identificação" description="Nome, descrição e imagem do produto.">
          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-6">
            {/* Foto */}
            <div className="space-y-2">
              <Label>Imagem</Label>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleImageSelect}
              />
              {imageUrl ? (
                <div className="relative w-40 h-40 rounded-lg overflow-hidden border bg-muted">
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="absolute top-1 right-1 bg-background/90 hover:bg-background rounded-full p-1 shadow"
                    aria-label="Remover imagem"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-40 h-40 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground hover:bg-muted/40 transition"
                >
                  {isUploading ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <>
                      <Camera className="h-6 w-6" />
                      <span className="text-xs">Selecionar imagem</span>
                    </>
                  )}
                </button>
              )}
              {imageUrl && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-40"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                >
                  Trocar imagem
                </Button>
              )}
            </div>

            {/* Nome / Descrição */}
            <div className="space-y-4">
              <Field label="Nome" required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: X-Burguer Especial"
                  maxLength={120}
                />
              </Field>
              <Field label="Descrição" hint={`${description.length}/500`}>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder="Ingredientes, modo de preparo, observações..."
                  rows={4}
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* ===================== CATEGORIA ===================== */}
        <Section title="Categoria" description="Onde o produto aparece no cardápio.">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Categoria" required>
              <Select
                value={categoryName}
                onValueChange={(v) => {
                  setCategoryName(v);
                  setSubcategoryId('');
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.name}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {availableSubcategories.length > 0 && (
              <Field label="Subcategoria" required>
                <Select value={subcategoryId} onValueChange={setSubcategoryId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSubcategories.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          </div>
        </Section>

        {/* ===================== VISIBILIDADE ===================== */}
        <Section
          title="Visibilidade"
          description="Defina onde este produto deve aparecer."
        >
          <div className="space-y-3">
            <ToggleRow
              label="Produto ativo"
              description="Quando desligado, o produto fica oculto em todos os canais."
              checked={active}
              onCheckedChange={setActive}
            />
            <ToggleRow
              label="Cardápio digital"
              description="Exibe no cardápio online para clientes."
              checked={menuItem}
              onCheckedChange={setMenuItem}
            />
            <ToggleRow
              label="PDV"
              description="Disponível para venda no PDV."
              checked={pdvItem}
              onCheckedChange={setPdvItem}
            />
            <ToggleRow
              label="Garçom / Mesas"
              description="Disponível no app do garçom e no cardápio de mesa."
              checked={waiterItem}
              onCheckedChange={setWaiterItem}
            />
            {!isNew && (
              <ToggleRow
                label="Destaque (Novidade)"
                description="Aparece na seção em destaque do cardápio. Limite de 5 produtos."
                checked={isFeatured}
                onCheckedChange={setIsFeatured}
              />
            )}
          </div>
        </Section>

        {/* ===================== DETALHES / PREÇO ===================== */}
        <Section title="Detalhes" description="Códigos, unidade, custo e preço de venda.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Código interno" hint="SKU. Gerado automaticamente se vazio.">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="P0001" />
            </Field>
            <Field label="GTIN / Código de barras">
              <Input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="7891234567890" />
            </Field>
            <Field label="Unidade">
              <Select value={unit} onValueChange={setUnit}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['UN', 'KG', 'L', 'ML', 'G', 'PC', 'CX', 'DZ', 'M'].map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="Custo (R$)">
              <Input
                type="number"
                step="0.01"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Preço de venda (R$)" required>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0,00"
              />
            </Field>
            <Field label="Margem">
              <div className="h-10 flex items-center px-3 rounded-md border bg-muted/40 text-sm">
                {margin == null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  <span className={margin < 0 ? 'text-destructive' : 'text-green-600 dark:text-green-500'}>
                    {margin.toFixed(1).replace('.', ',')}%
                  </span>
                )}
              </div>
            </Field>
          </div>

          {mercadoEnabled && (
            <div className="mt-6 pt-6 border-t space-y-4">
              <div>
                <h3 className="text-sm font-medium">Estoque</h3>
                <p className="text-xs text-muted-foreground">
                  As vendas baixam o estoque automaticamente.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field
                  label={isNew ? 'Estoque inicial' : 'Estoque atual'}
                  hint={
                    !isNew
                      ? 'Alterar este valor gera um ajuste manual no histórico.'
                      : undefined
                  }
                >
                  <Input
                    type="number"
                    min="0"
                    value={stockQuantity}
                    onChange={(e) => setStockQuantity(e.target.value)}
                    placeholder="0"
                  />
                </Field>
                <Field label="Estoque mínimo (alerta)">
                  <Input
                    type="number"
                    min="0"
                    value={minStock}
                    onChange={(e) => setMinStock(e.target.value)}
                    placeholder="0"
                  />
                </Field>
              </div>
            </div>
          )}
        </Section>

        {/* ===================== TRIBUTAÇÃO ===================== */}
        <Section
          title="Tributação"
          description="Regra fiscal aplicada na emissão de NFC-e / NF-e."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Field label="NCM" hint="8 dígitos. Ex.: 22021000">
              <Input
                value={ncm}
                onChange={(e) => setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))}
                onBlur={async (e) => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (!mercadoEnabled || !val || cest) return;
                  try {
                    const matches = await lookupCestByNcm(val);
                    if (matches.length === 1) {
                      setCest(matches[0].cest);
                      toast.success(`CEST ${matches[0].cest} preenchido automaticamente`);
                    } else if (matches.length > 1) {
                      setCestSuggestions(matches);
                    }
                  } catch {
                    /* lookup é best-effort */
                  }
                }}
                placeholder="00000000"
                inputMode="numeric"
              />
            </Field>
            <Field label="CEST" hint="7 dígitos, quando aplicável.">
              <Input
                value={cest}
                onChange={(e) => setCest(e.target.value.replace(/\D/g, '').slice(0, 7))}
                placeholder="0000000"
                inputMode="numeric"
              />
              {cestSuggestions.length > 1 && (
                <div className="mt-2 rounded-md border bg-muted/40 p-2 text-xs space-y-1">
                  <div className="font-medium text-muted-foreground">
                    Selecione o CEST aplicável:
                  </div>
                  {cestSuggestions.map((s) => (
                    <button
                      key={s.cest}
                      type="button"
                      onClick={() => {
                        setCest(s.cest);
                        setCestSuggestions([]);
                      }}
                      className="block w-full text-left rounded px-2 py-1 hover:bg-accent"
                    >
                      <span className="font-mono font-semibold">{s.cest}</span> — {s.desc}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setCestSuggestions([])}
                    className="text-muted-foreground hover:underline"
                  >
                    Fechar
                  </button>
                </div>
              )}
            </Field>
            <Field label="CFOP padrão" hint="Ex.: 5102 (venda dentro do estado).">
              <Input
                value={cfop}
                onChange={(e) => setCfop(e.target.value.replace(/\D/g, '').slice(0, 4))}
                placeholder="5102"
                inputMode="numeric"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Origem da mercadoria (ICMS)">
              <Select value={icmsOrigin} onValueChange={setIcmsOrigin}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0 — Nacional</SelectItem>
                  <SelectItem value="1">1 — Estrangeira (importação direta)</SelectItem>
                  <SelectItem value="2">2 — Estrangeira (mercado interno)</SelectItem>
                  <SelectItem value="3">3 — Nacional, conteúdo importado &gt; 40%</SelectItem>
                  <SelectItem value="4">4 — Nacional, processos básicos</SelectItem>
                  <SelectItem value="5">5 — Nacional, conteúdo importado ≤ 40%</SelectItem>
                  <SelectItem value="6">6 — Estrangeira (importação direta, sem similar)</SelectItem>
                  <SelectItem value="7">7 — Estrangeira (mercado interno, sem similar)</SelectItem>
                  <SelectItem value="8">8 — Nacional, conteúdo importado &gt; 70%</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field
              label="Regra de tributação"
              hint={
                taxRules.length === 0
                  ? 'Nenhuma regra cadastrada ainda.'
                  : undefined
              }
            >
              <Select
                value={taxRuleId || '__none'}
                onValueChange={(v) => setTaxRuleId(v === '__none' ? '' : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sem regra vinculada" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Sem regra vinculada</SelectItem>
                  {taxRules
                    .filter((r) => r.active)
                    .map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
        </Section>

        {/* ===================== OPCIONAIS ===================== */}
        {mercadoEnabled && (
          <Section
            title="Mercado / Varejo"
            description="Marca, fornecedor, atacado, validade e balança."
          >
            {/* Marca + fornecedor */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field label="Marca">
                <Input
                  value={brand}
                  onChange={(e) => setBrand(e.target.value)}
                  placeholder="Ex.: Coca-Cola"
                />
              </Field>
              <Field
                label="Fornecedor padrão"
                hint={suppliersList.length === 0 ? 'Cadastre fornecedores em Mercado › Fornecedores.' : undefined}
              >
                <Select
                  value={supplierId || '__none'}
                  onValueChange={(v) => setSupplierId(v === '__none' ? '' : v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sem fornecedor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Sem fornecedor</SelectItem>
                    {suppliersList.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {/* Atacado */}
            <div className="mt-6 pt-6 border-t">
              <div className="mb-3">
                <h3 className="text-sm font-medium">Atacado</h3>
                <p className="text-xs text-muted-foreground">
                  Preço diferenciado a partir de uma quantidade mínima.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Quantidade mínima">
                  <Input
                    type="number"
                    step="0.001"
                    min="0"
                    value={wholesaleMinQty}
                    onChange={(e) => setWholesaleMinQty(e.target.value)}
                    placeholder="Ex.: 12"
                  />
                </Field>
                <Field label="Preço de atacado (R$)">
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={wholesalePrice}
                    onChange={(e) => setWholesalePrice(e.target.value)}
                    placeholder="0,00"
                  />
                </Field>
              </div>
            </div>

            {/* Validade / lote */}
            <div className="mt-6 pt-6 border-t">
              <div className="mb-3">
                <h3 className="text-sm font-medium">Validade e lote</h3>
                <p className="text-xs text-muted-foreground">
                  Controle de shelf life e rastreabilidade do lote atual.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Field label="Validade (dias)" hint="A partir da entrada do produto.">
                  <Input
                    type="number"
                    min="0"
                    value={shelfLifeDays}
                    onChange={(e) => setShelfLifeDays(e.target.value)}
                    placeholder="Ex.: 30"
                  />
                </Field>
                <Field label="Data de validade (lote atual)">
                  <Input
                    type="date"
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                  />
                </Field>
                <Field label="Lote">
                  <Input
                    value={batchNumber}
                    onChange={(e) => setBatchNumber(e.target.value)}
                    placeholder="Ex.: L20260101"
                  />
                </Field>
              </div>
            </div>

            {/* Balança */}
            <div className="mt-6 pt-6 border-t space-y-3">
              <div>
                <h3 className="text-sm font-medium">Balança</h3>
                <p className="text-xs text-muted-foreground">
                  Configurações para produtos pesáveis vendidos por balança.
                </p>
              </div>
              <ToggleRow
                label="Produto pesável"
                description="Vendido por peso, lido em balança."
                checked={isScaleItem}
                onCheckedChange={setIsScaleItem}
              />
              {isScaleItem && (
                <>
                  <ToggleRow
                    label="Preço por kg"
                    description="Quando desligado, o preço é por unidade pesada."
                    checked={pricePerKg}
                    onCheckedChange={setPricePerKg}
                  />
                  <Field label="Código interno da balança" hint="Geralmente começa com 2 (EAN-13).">
                    <Input
                      value={scaleBarcode}
                      onChange={(e) => setScaleBarcode(e.target.value.replace(/\D/g, '').slice(0, 13))}
                      placeholder="2000001"
                      inputMode="numeric"
                    />
                  </Field>
                </>
              )}
            </div>
          </Section>
        )}

        {/* ===================== OPCIONAIS ===================== */}
        <Section
          title="Opcionais"
          description="Grupos de opcionais associados a este produto (via categoria ou vínculo direto)."
        >
          {linkedGroups.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
              Nenhum grupo de opcionais vinculado a este produto.
            </div>
          ) : (
            <ul className="divide-y border rounded-md">
              {linkedGroups.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{g.name}</div>
                    <div className="text-xs text-muted-foreground">
                      Mín. {g.min} • Máx. {g.max} • {g.itemsCount}{' '}
                      {g.itemsCount === 1 ? 'item' : 'itens'}
                    </div>
                  </div>
                  <Badge variant="secondary" className="shrink-0">
                    {g.source}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3">
            <Button asChild variant="outline" size="sm">
              <Link to="/grupos-de-opcionais">
                Gerenciar grupos de opcionais
                <ExternalLink className="h-3.5 w-3.5 ml-2" />
              </Link>
            </Button>
          </div>
        </Section>

        {/* ===================== AÇÕES (rodapé) ===================== */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => navigate('/produtos')} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isUploading}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </div>

        {/* Confirmação de alteração de estoque */}
        <AlertDialog
          open={stockConfirmOpen}
          onOpenChange={(o) => {
            if (!isSaving) setStockConfirmOpen(o);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirmar alteração de estoque</AlertDialogTitle>
              <AlertDialogDescription>
                {pendingStockChange && (
                  <>
                    Alterar o estoque de{' '}
                    <strong>{pendingStockChange.from}</strong> para{' '}
                    <strong>{pendingStockChange.to}</strong>?
                    <br />
                    Será registrado um ajuste manual no histórico de movimentações.
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isSaving}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                disabled={isSaving}
                onClick={(e) => {
                  e.preventDefault();
                  doSave();
                }}
              >
                Confirmar e salvar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

// ============ helpers ============

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        {description && (
          <p className="text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="rounded-lg border bg-card p-4 md:p-6">{children}</div>
    </section>
  );
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onCheckedChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="font-medium text-sm">{label}</div>
        {description && (
          <div className="text-xs text-muted-foreground">{description}</div>
        )}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}