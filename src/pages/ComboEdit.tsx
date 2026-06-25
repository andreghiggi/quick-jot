import { useParams, useNavigate, Navigate } from 'react-router-dom';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Camera, Loader2, X, AlertTriangle } from 'lucide-react';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCombos } from '@/hooks/useCombos';
import { useProducts } from '@/hooks/useProducts';
import { useCategories } from '@/hooks/useCategories';
import { useTaxRules } from '@/hooks/useTaxRules';
import { supabase } from '@/integrations/supabase/client';
import { uploadCompressedImage } from '@/utils/imageUtils';
import { toast } from 'sonner';

/**
 * Página de cadastro/edição de Combo — layout idêntico ao ProductEdit
 * (página única rolando, com a seção extra "Itens do combo").
 *
 * Rotas:
 *   /combos/novo   → cadastro
 *   /combos/:id    → edição
 */
export default function ComboEdit() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { company } = useAuthContext();
  const { combos, loading, saveCombo } = useCombos({ companyId: company?.id });
  const { products } = useProducts({ companyId: company?.id });
  const { categories } = useCategories({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });

  const isNew = !id || id === 'novo';
  const existing = useMemo(
    () => (isNew ? null : combos.find((c) => c.id === id) ?? null),
    [combos, id, isNew],
  );

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ---------- form state ----------
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [active, setActive] = useState(true);
  const [menuItem, setMenuItem] = useState(true);
  const [pdvItem, setPdvItem] = useState(true);
  const [waiterItem, setWaiterItem] = useState(true);
  const [code, setCode] = useState('');
  const [gtin, setGtin] = useState('');
  const [price, setPrice] = useState('');
  const [taxRuleId, setTaxRuleId] = useState<string>('');
  const [ncm, setNcm] = useState('');
  const [cest, setCest] = useState('');
  const [cfop, setCfop] = useState('');
  const [items, setItems] = useState<Array<{ product_id: string; quantity: number }>>([]);
  const [productSearch, setProductSearch] = useState('');

  const [hydrated, setHydrated] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (hydrated) return;
    if (isNew) {
      setHydrated(true);
      return;
    }
    if (existing) {
      setName(existing.name || '');
      setDescription(existing.description || '');
      setImageUrl(existing.image_url || '');
      setCategoryIds(existing.category_ids || []);
      setActive(existing.active);
      setMenuItem(existing.menu_item ?? true);
      setPdvItem(existing.pdv_item ?? true);
      setWaiterItem(existing.waiter_item ?? true);
      setCode(existing.code || '');
      setGtin(existing.gtin || '');
      setPrice(existing.price != null ? String(existing.price) : '');
      setTaxRuleId(existing.tax_rule_id || '');
      setNcm(existing.ncm || '');
      setCest(existing.cest || '');
      setCfop(existing.cfop || '');
      setItems(existing.items.map((it) => ({ product_id: it.product_id, quantity: it.quantity })));
      setHydrated(true);
    }
  }, [existing, isNew, hydrated]);

  if (!isNew && !loading && !existing) {
    return <Navigate to="/combos" replace />;
  }

  const filteredProducts = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    if (!q) return [];
    return products
      .filter((p) => p.active)
      .filter((p) => p.name.toLowerCase().includes(q) || (p.code || '').toLowerCase().includes(q))
      .slice(0, 20);
  }, [products, productSearch]);

  const fiscalWarning = useMemo(() => {
    if (items.length < 2) return null;
    const rules = new Set(
      items.map((it) => products.find((p) => p.id === it.product_id)?.taxRuleId || '—'),
    );
    if (rules.size > 1) {
      return 'Os itens têm regras tributárias diferentes. Na NFC-e cada componente sai com sua própria tributação (kit explodido).';
    }
    return null;
  }, [items, products]);

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !company?.id) return;
    setIsUploading(true);
    try {
      const path = `combos/${company.id}/${Date.now()}.webp`;
      const result = await uploadCompressedImage(supabase, 'product-images', path, file, { upsert: true });
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

  function addItem(productId: string) {
    if (items.some((it) => it.product_id === productId)) return;
    setItems((arr) => [...arr, { product_id: productId, quantity: 1 }]);
  }

  function updateItemQty(productId: string, qty: number) {
    setItems((arr) => arr.map((it) => (it.product_id === productId ? { ...it, quantity: qty } : it)));
  }

  function removeItem(productId: string) {
    setItems((arr) => arr.filter((it) => it.product_id !== productId));
  }

  function validate(): string | null {
    if (!name.trim()) return 'Informe o nome do combo';
    if (!price || isNaN(parseFloat(price))) return 'Informe o preço de venda';
    if (items.length === 0) return 'Adicione pelo menos 1 item ao combo';
    return null;
  }

  async function handleSave() {
    const err = validate();
    if (err) {
      toast.error(err);
      return;
    }
    setIsSaving(true);
    try {
      const ok = await saveCombo(
        {
          id: existing?.id,
          name: name.trim(),
          code: code.trim() || null,
          gtin: gtin.trim() || null,
          description: description.trim() || null,
          image_url: imageUrl || null,
          price: parseFloat(price) || 0,
          active,
          pdv_item: pdvItem,
          menu_item: menuItem,
          waiter_item: waiterItem,
          fiscal_mode: 'explodido',
          ncm: ncm.trim() || null,
          cfop: cfop.trim() || null,
          cest: cest.trim() || null,
          tax_rule_id: taxRuleId || null,
        },
        items,
        categoryIds,
      );
      if (ok) navigate('/combos');
    } finally {
      setIsSaving(false);
    }
  }

  const title = isNew ? 'Novo combo' : existing?.name || 'Editar combo';

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto p-4 space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={() => navigate('/combos')} aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <h1 className="text-2xl font-semibold truncate">{title}</h1>
        </div>

        {/* IDENTIFICAÇÃO */}
        <Section title="Identificação" description="Nome, descrição e imagem do combo.">
          <div className="grid grid-cols-1 md:grid-cols-[160px_1fr] gap-6">
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

            <div className="space-y-4">
              <Field label="Nome" required>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex.: Combo X-Burguer + Refri"
                  maxLength={120}
                />
              </Field>
              <Field label="Descrição" hint={`${description.length}/500`}>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 500))}
                  placeholder="O que vem no combo..."
                  rows={4}
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* CATEGORIAS */}
        <Section title="Categorias" description="Onde o combo aparece no cardápio.">
          {categories.length === 0 ? (
            <div className="text-sm text-muted-foreground py-4 text-center border border-dashed rounded-md">
              Nenhuma categoria cadastrada.
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => {
                const checked = categoryIds.includes(cat.id);
                return (
                  <label
                    key={cat.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded border cursor-pointer text-sm ${
                      checked ? 'bg-primary/10 border-primary' : ''
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) =>
                        setCategoryIds((ids) =>
                          v ? [...ids, cat.id] : ids.filter((x) => x !== cat.id),
                        )
                      }
                    />
                    {cat.name}
                  </label>
                );
              })}
            </div>
          )}
        </Section>

        {/* VISIBILIDADE */}
        <Section title="Visibilidade" description="Defina onde este combo deve aparecer.">
          <div className="space-y-3">
            <ToggleRow
              label="Combo ativo"
              description="Quando desligado, o combo fica oculto em todos os canais."
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
          </div>
        </Section>

        {/* DETALHES */}
        <Section title="Detalhes" description="Códigos e preço do combo.">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Código interno" hint="SKU. Gerado automaticamente se vazio.">
              <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="COMBO001" />
            </Field>
            <Field label="GTIN / Código de barras">
              <Input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="7891234567890" />
            </Field>
            <Field label="Preço do combo (R$)" required>
              <CurrencyInput
                value={price}
                onValueChange={(n, text) => setPrice(text === '' ? '' : String(n))}
                placeholder="0,00"
              />
            </Field>
          </div>
        </Section>

        {/* ITENS DO COMBO */}
        <Section
          title="Itens do combo"
          description="Produtos cadastrados que compõem este combo."
        >
          <div className="space-y-3">
            <Field label="Adicionar produto">
              <Input
                value={productSearch}
                onChange={(e) => setProductSearch(e.target.value)}
                placeholder="Buscar por nome ou código"
              />
              {productSearch && (
                <div className="mt-2 max-h-56 overflow-y-auto border rounded-md">
                  {filteredProducts.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-muted-foreground">
                      Nenhum produto encontrado.
                    </div>
                  ) : (
                    filteredProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm flex items-center justify-between"
                        onClick={() => {
                          addItem(p.id);
                          setProductSearch('');
                        }}
                      >
                        <span className="truncate">{p.name}</span>
                        <span className="text-xs text-muted-foreground shrink-0 ml-2">
                          R$ {p.price.toFixed(2).replace('.', ',')}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </Field>

            {fiscalWarning && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded text-amber-900 text-sm">
                <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                {fiscalWarning}
              </div>
            )}

            {items.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center border border-dashed rounded-md">
                Nenhum item ainda. Use a busca acima para adicionar.
              </div>
            ) : (
              <ul className="divide-y border rounded-md">
                {items.map((it) => {
                  const p = products.find((x) => x.id === it.product_id);
                  return (
                    <li key={it.product_id} className="flex items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{p?.name || it.product_id}</div>
                        <div className="text-xs text-muted-foreground">
                          {p?.code ? `${p.code} · ` : ''}R$ {(p?.price ?? 0).toFixed(2).replace('.', ',')}
                        </div>
                      </div>
                      <Input
                        type="number"
                        min="0.001"
                        step="0.001"
                        value={it.quantity}
                        onChange={(e) => updateItemQty(it.product_id, Number(e.target.value))}
                        className="w-24"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="text-destructive"
                        onClick={() => removeItem(it.product_id)}
                        aria-label="Remover item"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </Section>

        {/* TRIBUTAÇÃO */}
        <Section
          title="Tributação"
          description="Modo padrão: Kit explodido. Cada item componente sai como uma linha fiscal própria na NFC-e. Os campos abaixo servem como fallback caso algum componente não tenha NCM/CFOP próprio."
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <Field label="NCM" hint="8 dígitos. Ex.: 22021000">
              <Input
                value={ncm}
                onChange={(e) => setNcm(e.target.value.replace(/\D/g, '').slice(0, 8))}
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
          <Field
            label="Regra de tributação"
            hint={taxRules.length === 0 ? 'Nenhuma regra cadastrada ainda.' : undefined}
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
        </Section>

        {/* AÇÕES */}
        <div className="flex items-center justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => navigate('/combos')} disabled={isSaving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isSaving || isUploading}>
            {isSaving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Salvar
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}

// ============ helpers (mesmos do ProductEdit) ============

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
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
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
        {description && <div className="text-xs text-muted-foreground">{description}</div>}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}