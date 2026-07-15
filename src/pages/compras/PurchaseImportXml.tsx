import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { Upload, Loader2, CheckCircle2, FileInput, ChevronLeft, Check, ChevronsUpDown, Ban, Undo2, AlertTriangle } from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';
import { useCategories } from '@/hooks/useCategories';
import { useTaxRules } from '@/hooks/useTaxRules';

type ProductType = 'cardapio' | 'mercado' | 'ambos';
function visibilityFromType(t: ProductType) {
  if (t === 'mercado') return { pdv_item: true, menu_item: false, waiter_item: false, qr_item: false };
  return { pdv_item: true, menu_item: true, waiter_item: true, qr_item: true };
}

type ItemRow = {
  xml_codigo: string;
  xml_descricao: string;
  xml_ean: string;
  xml_ncm: string;
  xml_cfop: string;
  xml_unidade: string;
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  product_id: string | null; // null => criar novo
  createNew: boolean;
  newName: string;
  // CFOP de entrada convertido — editável por linha (Fase 6)
  cfop_entrada: string;
  // --- Conversão / preço (Fase 1) ---
  conversion_factor: number;   // ex.: fardo c/ 15 → 15
  stock_unit: string;          // unidade que entra no estoque
  sale_price: number;          // preço sugerido de venda
  unit_weight_kg: number | null; // opcional, p/ KG→UN
  // --- Enriquecimento fiscal para PRODUTO NOVO (v1.46.2-beta) ---
  category_id: string | null;
  category_name: string;
  tax_rule_id: string | null;
  product_type: ProductType;
  pdv_item: boolean;
  menu_item: boolean;
  waiter_item: boolean;
  qr_item: boolean;
  // --- Fase opcional: ignorar item na importação (não altera XML/fiscal) ---
  skip: boolean;
  // Alerta de GTIN duplicado detectado no cadastro (Fase 7)
  gtin_dup_warning?: string;
};

type Header = {
  chave: string;
  cnpj_emit: string;
  nome_emit: string;
  numero: string;
  serie: string;
  emissao: string;
  valor_total: number;
  // Enriquecimento fornecedor (v1.47)
  ie_emit?: string;
  fone_emit?: string;
  end_logradouro?: string;
  end_numero?: string;
  end_bairro?: string;
  end_municipio?: string;
  end_uf?: string;
  end_cep?: string;
};

// Converte CFOP de saída (do XML do fornecedor) para CFOP de entrada.
// 5xxx → 1xxx (dentro do estado), 6xxx → 2xxx (interestadual), 7xxx → 3xxx (importação).
// Demais códigos permanecem como estão.
function cfopSaidaParaEntrada(cfop: string | null | undefined): string | null {
  if (!cfop) return null;
  const c = String(cfop).replace(/\D/g, '');
  if (c.length !== 4) return cfop || null;
  const map: Record<string, string> = { '5': '1', '6': '2', '7': '3' };
  const first = c[0];
  if (!map[first]) return c;
  return map[first] + c.slice(1);
}

type ProductSlim = { id: string; name: string; gtin: string | null; price: number | null; unit: string | null };

type SupplierProductLink = {
  xml_codigo: string | null;
  xml_ean: string | null;
  product_id: string | null;
  stock_unit: string | null;
  sale_price: number | null;
};

function normalizeGtin(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw || /sem\s*gtin/i.test(raw)) return '';
  return raw.replace(/\D/g, '');
}

function findProductByGtin(products: ProductSlim[], gtin: string | null | undefined): ProductSlim | undefined {
  const normalized = normalizeGtin(gtin);
  if (!normalized) return undefined;
  return products.find((p) => normalizeGtin(p.gtin) === normalized);
}

function normalizeSupplierProductCode(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

function findProductBySupplierHistory(
  products: ProductSlim[],
  links: SupplierProductLink[],
  xmlCodigo: string | null | undefined,
  xmlEan: string | null | undefined,
): ProductSlim | undefined {
  const productById = new Map(products.map((p) => [p.id, p]));
  const codigo = normalizeSupplierProductCode(xmlCodigo);
  const ean = normalizeGtin(xmlEan);
  const byCode = codigo
    ? links.find((link) =>
        link.product_id &&
        normalizeSupplierProductCode(link.xml_codigo) === codigo &&
        productById.has(link.product_id),
      )
    : undefined;
  if (byCode?.product_id) return productById.get(byCode.product_id);

  const byEan = ean
    ? links.find((link) =>
        link.product_id &&
        normalizeGtin(link.xml_ean) === ean &&
        productById.has(link.product_id),
      )
    : undefined;
  if (byEan?.product_id) return productById.get(byEan.product_id);
  return undefined;
}

export default function PurchaseImportXml() {
  const { company } = useAuthContext();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const documentoId = params.get('documentoId');

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [xmlText, setXmlText] = useState<string>('');
  const [header, setHeader] = useState<Header | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [products, setProducts] = useState<ProductSlim[]>([]);
  const [supplierProductLinks, setSupplierProductLinks] = useState<SupplierProductLink[]>([]);
  const [dfeId, setDfeId] = useState<string | null>(documentoId);
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});
  const { categories } = useCategories({ companyId: company?.id });
  const { taxRules } = useTaxRules({ companyId: company?.id });
  const [bulkCategoryId, setBulkCategoryId] = useState<string>('');
  const [bulkTaxRuleId, setBulkTaxRuleId] = useState<string>('');
  const [bulkType, setBulkType] = useState<ProductType | ''>('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  // Estado do fluxo de "SEFAZ ainda não liberou XML completo" —
  // usado para oferecer o botão "Executar Confirmação da Operação agora"
  // dentro da própria tela de importação, sem voltar em Manifestação.
  const [xmlUnavailable, setXmlUnavailable] = useState<{
    message: string;
    needsConfirmacao: boolean;
  } | null>(null);
  const [confirmingOp, setConfirmingOp] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    supabase.from('products').select('id,name,gtin,price,unit').eq('company_id', company.id).then(({ data }) => {
      setProducts((data as any) || []);
    });
    if (documentoId) loadFromDfe(documentoId);
  }, [company?.id, documentoId]);

  useEffect(() => {
    if (!company?.id || !header?.cnpj_emit) {
      setSupplierProductLinks([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: invoices, error: invError } = await supabase
        .from('purchase_invoices')
        .select('id')
        .eq('company_id', company.id)
        .eq('cnpj_emitente', header.cnpj_emit)
        .order('created_at', { ascending: false })
        .limit(80);

      if (cancelled) return;
      if (invError || !invoices?.length) {
        setSupplierProductLinks([]);
        return;
      }

      const invoiceIds = invoices.map((inv: any) => inv.id).filter(Boolean);
      const { data: rows, error: itemsError } = await supabase
        .from('purchase_invoice_items')
        .select('xml_codigo, xml_ean, product_id, stock_unit, sale_price')
        .eq('company_id', company.id)
        .in('invoice_id', invoiceIds)
        .not('product_id', 'is', null);

      if (!cancelled) {
        setSupplierProductLinks(itemsError ? [] : ((rows as any) || []));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [company?.id, header?.cnpj_emit]);

  // Reconciliação automática: quando produtos e histórico de compras terminam
  // de carregar depois do parse do XML, tenta casar itens ainda marcados como
  // "criar novo" primeiro por EAN/GTIN e depois pelo histórico do mesmo
  // fornecedor (código do produto no XML). Evita duplicar produto já importado.
  useEffect(() => {
    if (products.length === 0 || items.length === 0) return;
    let changed = false;
    const next = items.map((it) => {
      if (!it.createNew) return it;
      const matched = findProductByGtin(products, it.xml_ean)
        || findProductBySupplierHistory(products, supplierProductLinks, it.xml_codigo, it.xml_ean);
      if (!matched) return it;
      changed = true;
      return {
        ...it,
        product_id: matched.id,
        createNew: false,
        stock_unit: matched.unit || it.stock_unit,
        sale_price: matched.price ?? it.sale_price,
      };
    });
    if (changed) setItems(next);
  }, [items, products, supplierProductLinks]);

  async function loadFromDfe(id: string) {
    if (!company?.id) return;
    setLoading(true);
    setXmlUnavailable(null);
    try {
      const { data: doc } = await supabase.from('dfe_documentos')
        .select('*').eq('id', id).maybeSingle();
      if (!doc) throw new Error('Documento não encontrado');
      // Garantir XML baixado
      let xmlPath = (doc as any).xml_path;
      if (!xmlPath) {
        const { data, error } = await supabase.functions.invoke('dfe-fiscalflow-proxy', {
          body: { companyId: company.id, action: 'download_xml', documentoId: id },
        });
        // O cliente Supabase v2 devolve `error` em HTTP não-2xx e `data` pode vir
        // `null`. Precisamos ler o corpo do erro para mostrar a mensagem real
        // ("SEFAZ ainda não liberou o XML completo" / "Faça a Confirmação").
        if (error || !data || data.error) {
          let bodyMsg: string | null = null;
          let bodyCode: string | null = null;
          if (data?.error) {
            bodyMsg = data.error;
            bodyCode = data?.code || null;
          } else if ((error as any)?.context?.body) {
            try {
              const parsed = typeof (error as any).context.body === 'string'
                ? JSON.parse((error as any).context.body)
                : (error as any).context.body;
              bodyMsg = parsed?.error || null;
              bodyCode = parsed?.code || null;
            } catch { /* noop */ }
          } else if ((error as any)?.context && typeof (error as any).context.text === 'function') {
            try {
              const t = await (error as any).context.text();
              const parsed = JSON.parse(t);
              bodyMsg = parsed?.error || null;
              bodyCode = parsed?.code || null;
            } catch { /* noop */ }
          }
          const finalMsg = bodyMsg
            || (error as any)?.message
            || 'Não foi possível baixar o XML desta NF-e.';
          if (bodyCode === 'NOT_AVAILABLE' || /confirmac|resNFe|resumo/i.test(finalMsg)) {
            setXmlUnavailable({ message: finalMsg, needsConfirmacao: true });
            setLoading(false);
            return;
          }
          throw new Error(finalMsg);
        }
        xmlPath = data?.xml_path;
        if (data?.xml) { parseXml(data.xml, { throwOnError: true }); setLoading(false); return; }
      }
      if (!xmlPath) throw new Error('XML não disponível para este documento.');
      const { data: file, error: dlErr } = await supabase.storage.from('dfe-xmls').download(xmlPath);
      if (dlErr || !file) {
        throw new Error(dlErr?.message || 'XML não encontrado no storage. Baixe novamente pela tela de Manifestação.');
      }
      const text = await file.text();
      try {
        parseXml(text, { throwOnError: true });
      } catch (parseError: any) {
        // Alguns XMLs antigos podem ter sido salvos como resumo (resNFe) ou retorno JSON.
        // Força novo download do backend; se ainda vier resumo, mostra mensagem operacional correta.
        if (isDfeSummaryOrWrapped(text) || String(parseError?.message || '').includes('infNFe')) {
          const { data, error } = await supabase.functions.invoke('dfe-fiscalflow-proxy', {
            body: { companyId: company.id, action: 'download_xml', documentoId: id },
          });
          if (error || !data || data.error) {
            const finalMsg = data?.error || (error as any)?.message || 'XML ainda não disponível.';
            if (data?.code === 'NOT_AVAILABLE' || /confirmac|resNFe|resumo/i.test(finalMsg)) {
              setXmlUnavailable({ message: finalMsg, needsConfirmacao: true });
              setLoading(false);
              return;
            }
            throw new Error(finalMsg);
          }
          if (!data?.xml) throw parseError;
          parseXml(data.xml, { throwOnError: true });
        } else {
          throw parseError;
        }
      }
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar XML');
    } finally { setLoading(false); }
  }

  // Executa a Confirmação da Operação e tenta rebaixar o XML completo.
  async function handleConfirmarOperacao() {
    if (!company?.id || !dfeId) return;
    setConfirmingOp(true);
    try {
      const { data: mData, error: mErr } = await supabase.functions.invoke('dfe-fiscalflow-proxy', {
        body: {
          companyId: company.id,
          action: 'manifestar',
          documentoId: dfeId,
          tipo: 'confirmacao',
          justificativa: '',
        },
      });
      if (mErr || mData?.error) {
        throw new Error(mData?.error || (mErr as any)?.message || 'Falha ao confirmar operação');
      }
      toast.success('Confirmação da Operação enviada. Baixando XML…');
      // pequeno delay para a SEFAZ liberar o XML completo
      await new Promise(r => setTimeout(r, 2500));
      await loadFromDfe(dfeId);
    } catch (e: any) {
      toast.error(e.message || 'Falha ao confirmar operação');
    } finally {
      setConfirmingOp(false);
    }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => parseXml(String(reader.result || ''));
    reader.readAsText(f);
  }

  function parseXml(text: string, options?: { throwOnError?: boolean }) {
    const normalizedText = extractXmlPayload(text);
    setXmlText(normalizedText);
    try {
      const doc = new DOMParser().parseFromString(normalizedText, 'text/xml');
      // Tolerante a namespace (ex.: <nfe:infNFe>) e a XMLs embrulhados em JSON.
      const getEls = (el: Element | Document | null, tag: string): Element[] => {
        if (!el) return [];
        const anyEl = el as any;
        const byNs = anyEl.getElementsByTagNameNS
          ? Array.from(anyEl.getElementsByTagNameNS('*', tag) as HTMLCollectionOf<Element>)
          : [];
        const byName = anyEl.getElementsByTagName
          ? Array.from(anyEl.getElementsByTagName(tag) as HTMLCollectionOf<Element>)
          : [];
        const byLocalName = anyEl.getElementsByTagName
          ? Array.from(anyEl.getElementsByTagName('*') as HTMLCollectionOf<Element>)
              .filter((node) => node.localName === tag || node.nodeName.split(':').pop() === tag)
          : [];
        return Array.from(new Set([...byNs, ...byName, ...byLocalName]));
      };
      const first = (el: Element | Document | null, tag: string): Element | null =>
        getEls(el, tag)[0] || null;
      const get = (el: Element | null, tag: string) =>
        first(el, tag)?.textContent?.trim() || '';
      const parserError = first(doc, 'parsererror');
      if (parserError) throw new Error('XML inválido ou retorno do servidor em formato inesperado');
      const resNFe = first(doc, 'resNFe');
      if (resNFe) {
        throw new Error('Este arquivo é apenas o resumo da NF-e (resNFe), sem itens. Faça Ciência/Confirmação e baixe o XML completo antes de importar.');
      }
      const infNFe = first(doc, 'infNFe');
      if (!infNFe) throw new Error('XML não é uma NF-e completa válida (infNFe ausente)');
      const chave = (infNFe.getAttribute('Id') || '').replace(/^NFe/, '');
      const emit = first(infNFe, 'emit') as Element | null;
      const ide = first(infNFe, 'ide') as Element | null;
      const total = first(first(infNFe, 'total'), 'ICMSTot') as Element | null;
      const enderEmit = first(emit, 'enderEmit') as Element | null;
      const h: Header = {
        chave,
        cnpj_emit: get(emit, 'CNPJ'),
        nome_emit: get(emit, 'xNome'),
        numero: get(ide, 'nNF'),
        serie: get(ide, 'serie'),
        emissao: get(ide, 'dhEmi') || get(ide, 'dEmi'),
        valor_total: Number(get(total, 'vNF') || 0),
        ie_emit: get(emit, 'IE'),
        fone_emit: get(enderEmit, 'fone'),
        end_logradouro: get(enderEmit, 'xLgr'),
        end_numero: get(enderEmit, 'nro'),
        end_bairro: get(enderEmit, 'xBairro'),
        end_municipio: get(enderEmit, 'xMun'),
        end_uf: get(enderEmit, 'UF'),
        end_cep: get(enderEmit, 'CEP'),
      };
      setHeader(h);

      const dets = getEls(infNFe, 'det');
      const its: ItemRow[] = dets.map((det) => {
        const prod = first(det, 'prod') as Element | null;
        const ean = normalizeGtin(get(prod, 'cEAN')) || normalizeGtin(get(prod, 'cEANTrib'));
        const descricao = get(prod, 'xProd');
        const matched = findProductByGtin(products, ean);
        const uCom = get(prod, 'uCom');
        const vUn = Number(get(prod, 'vUnCom') || 0);
        const defaultCat = categories[0];
        const defaultVis = visibilityFromType('mercado');
        return {
          xml_codigo: get(prod, 'cProd'),
          xml_descricao: descricao,
          xml_ean: ean,
          xml_ncm: get(prod, 'NCM'),
          xml_cfop: get(prod, 'CFOP'),
          xml_unidade: uCom,
          quantidade: Number(get(prod, 'qCom') || 0),
          valor_unitario: vUn,
          valor_total: Number(get(prod, 'vProd') || 0),
          product_id: matched?.id || null,
          createNew: !matched,
          newName: descricao,
          conversion_factor: 1,
          stock_unit: matched?.unit || uCom || 'UN',
          sale_price: matched?.price ?? vUn,
          unit_weight_kg: null,
          category_id: defaultCat?.id || null,
          category_name: defaultCat?.name || 'Mercado',
          tax_rule_id: null,
          product_type: 'mercado',
          ...defaultVis,
          skip: false,
        };
      });
      setItems(its);
      toast.success(`${its.length} item(ns) lido(s) do XML`);
      return true;
    } catch (e: any) {
      if (options?.throwOnError) throw e;
      toast.error(e.message || 'XML inválido');
      return false;
    }
  }

  function extractXmlPayload(raw: string): string {
    const trimmed = String(raw || '').replace(/^\uFEFF/, '').trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return decodeXmlEntitiesIfNeeded(trimmed);
    try {
      const parsed = JSON.parse(trimmed);
      const found = findXmlString(parsed);
      return decodeXmlEntitiesIfNeeded(found || trimmed);
    } catch {
      return decodeXmlEntitiesIfNeeded(trimmed);
    }
  }

  function findXmlString(value: unknown): string | null {
    if (typeof value === 'string') {
      const v = value.trim();
      return /<\??xml|<([A-Za-z_][\w.-]*:)?(nfeProc|NFe|infNFe|resNFe)\b/.test(v) ? v : null;
    }
    if (!value || typeof value !== 'object') return null;
    const obj = value as Record<string, unknown>;
    for (const key of ['xml', 'procNFe', 'nfeProc', 'content', 'data']) {
      const found = findXmlString(obj[key]);
      if (found) return found;
    }
    for (const child of Object.values(obj)) {
      const found = findXmlString(child);
      if (found) return found;
    }
    return null;
  }

  function decodeXmlEntitiesIfNeeded(value: string): string {
    if (!value.includes('&lt;')) return value;
    return value
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&amp;/g, '&');
  }

  function isDfeSummaryOrWrapped(raw: string): boolean {
    const normalized = extractXmlPayload(raw);
    return /<([A-Za-z_][\w.-]*:)?resNFe\b/.test(normalized) || raw.trim().startsWith('{');
  }

  const totalCalc = useMemo(() => items.reduce((s, i) => s + i.valor_total, 0), [items]);

  function updateItem(idx: number, patch: Partial<ItemRow>) {
    const copy = [...items];
    copy[idx] = { ...copy[idx], ...patch };
    setItems(copy);
  }

  function applyMarkupToAll(percent: number) {
    setItems(prev => prev.map((it) => {
      const factor = it.conversion_factor > 0 ? it.conversion_factor : 1;
      const realCost = it.valor_unitario / factor;
      return { ...it, sale_price: Number((realCost * (1 + percent / 100)).toFixed(2)) };
    }));
    toast.success(`Markup de ${percent}% aplicado a todos os itens`);
  }

  // ---- Bulk actions (apenas para itens que criarão produto novo) ----
  function bulkApplyCategory() {
    if (!bulkCategoryId) { toast.error('Selecione uma categoria'); return; }
    const cat = categories.find(c => c.id === bulkCategoryId);
    if (!cat) return;
    setItems(prev => prev.map(it => it.createNew
      ? { ...it, category_id: cat.id, category_name: cat.name }
      : it));
    toast.success('Categoria aplicada aos novos produtos');
  }
  function bulkApplyTaxRule() {
    if (!bulkTaxRuleId) { toast.error('Selecione uma regra'); return; }
    setItems(prev => prev.map(it => it.createNew
      ? { ...it, tax_rule_id: bulkTaxRuleId }
      : it));
    toast.success('Regra tributária aplicada aos novos produtos');
  }
  function bulkApplyType() {
    if (!bulkType) { toast.error('Selecione o tipo'); return; }
    const vis = visibilityFromType(bulkType as ProductType);
    setItems(prev => prev.map(it => it.createNew
      ? { ...it, product_type: bulkType as ProductType, ...vis }
      : it));
    toast.success('Tipo aplicado aos novos produtos');
  }

  async function handleConfirm() {
    if (!company?.id || !header) return;
    // -------- Validações bloqueantes (evitam "correção manual depois") --------
    const importables = items.filter(i => !i.skip);
    if (importables.length === 0) {
      toast.error('Nenhum item selecionado para importação.');
      return;
    }
    const invalidQty = importables.find(i => !(i.quantidade > 0) || !(i.conversion_factor > 0));
    if (invalidQty) {
      toast.error(`Item "${invalidQty.xml_descricao}" com quantidade ou fator inválido.`);
      return;
    }
    const missingCategory = importables.find(i => i.createNew && !i.category_id);
    if (missingCategory) {
      toast.error(`Selecione uma categoria para "${missingCategory.newName || missingCategory.xml_descricao}".`);
      return;
    }
    const missingTax = importables.find(i => i.createNew && !i.tax_rule_id);
    if (missingTax) {
      toast.error(`Selecione a regra tributária para "${missingTax.newName || missingTax.xml_descricao}". Sem ela, o produto vende com CFOP/CSOSN padrão errado.`);
      return;
    }
    const emptyName = importables.find(i => i.createNew && !String(i.newName || '').trim());
    if (emptyName) {
      toast.error('Todos os produtos novos precisam de nome.');
      return;
    }
    // Alerta (não bloqueante) para diferença entre soma dos itens e valor da NF.
    const soma = importables.reduce((s, i) => s + (i.valor_total || 0), 0);
    const totalXml = header.valor_total || 0;
    if (Math.abs(soma - totalXml) > 0.05 && !items.some(i => i.skip)) {
      const ok = window.confirm(
        `Atenção: a soma dos itens (${soma.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}) `
        + `diverge do valor total da NF (${totalXml.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}). `
        + `Deseja continuar mesmo assim?`
      );
      if (!ok) return;
    }
    setSaving(true);
    try {
      // 0) duplicidade: mesma NF (chave) já lançada?
      if (header.chave) {
        const { data: dup } = await (supabase.from('purchase_invoices') as any)
          .select('id, numero_nfe')
          .eq('company_id', company.id)
          .eq('chave_acesso', header.chave)
          .maybeSingle();
        if (dup) {
          toast.error(`Esta NF já foi importada anteriormente (nº ${(dup as any).numero_nfe}). Entrada não duplicada.`);
          setSaving(false);
          return;
        }
      }
      // 1) supplier: busca por CNPJ, cria se não existir
      let supplierId: string | null = null;
      if (header.cnpj_emit) {
        const { data: sup } = await (supabase.from('suppliers') as any)
          .select('id').eq('company_id', company.id).eq('document', header.cnpj_emit).maybeSingle();
        if (sup) supplierId = (sup as any).id;
        else {
          const { data: novo } = await (supabase.from('suppliers') as any).insert({
            company_id: company.id,
            name: header.nome_emit || 'Fornecedor',
            document: header.cnpj_emit,
            state_registration: header.ie_emit || null,
            phone: header.fone_emit || null,
            address: header.end_logradouro || null,
            number: header.end_numero || null,
            neighborhood: header.end_bairro || null,
            city: header.end_municipio || null,
            state: header.end_uf || null,
            zip_code: header.end_cep || null,
          }).select('id').single();
          supplierId = (novo as any)?.id || null;
        }
      }

      // 2) salvar XML no storage (caso veio de upload manual)
      let xmlPath: string | null = null;
      if (xmlText && header.chave) {
        xmlPath = `${company.id}/${header.chave}.xml`;
        await supabase.storage.from('dfe-xmls').upload(
          xmlPath, new Blob([xmlText], { type: 'application/xml' }),
          { upsert: true, contentType: 'application/xml' },
        );
      }

      // 3) criar invoice
      const { data: inv, error: invErr } = await supabase.from('purchase_invoices').insert({
        company_id: company.id,
        dfe_documento_id: dfeId,
        supplier_id: supplierId,
        chave_acesso: header.chave,
        cnpj_emitente: header.cnpj_emit,
        nome_emitente: header.nome_emit,
        numero_nfe: header.numero,
        serie: header.serie,
        data_emissao: header.emissao,
        valor_total: header.valor_total,
        xml_path: xmlPath,
        status: 'lancada',
      } as any).select('id').single();
      if (invErr) throw invErr;
      const invoiceId = (inv as any).id;

      // 4) itens + criar produtos novos + movimentar estoque
      const gtinUpdates: string[] = []; // nomes dos produtos que tiveram GTIN preenchido
      const gtinDivergentes: string[] = []; // produtos com GTIN cadastrado diferente do XML
      const isValidGtin = (g: string) => /^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(g);
      // Descobre próximo SKU (P0001, P0002...) para os produtos novos desta nota
      let nextSkuNum = 0;
      {
        const { data: existingCodes } = await supabase
          .from('products')
          .select('code')
          .eq('company_id', company.id)
          .like('code', 'P%');
        (existingCodes || []).forEach((row: any) => {
          const m = /^P(\d+)$/.exec(row.code || '');
          if (m) {
            const n = parseInt(m[1], 10);
            if (n > nextSkuNum) nextSkuNum = n;
          }
        });
      }
      for (const it of items) {
        if (it.skip) continue;
        const factor = it.conversion_factor > 0 ? it.conversion_factor : 1;
        const stockQty = it.quantidade * factor;
        const realCost = it.valor_unitario / factor;
        let productId = it.product_id;
        if (!productId && it.createNew) {
          nextSkuNum += 1;
          const newSku = 'P' + String(nextSkuNum).padStart(4, '0');
          const { data: prod, error: pErr } = await supabase.from('products').insert({
            company_id: company.id,
            name: it.newName || it.xml_descricao,
            code: newSku,
            price: it.sale_price || realCost,
            cost_price: realCost,
            category: it.category_name || 'Mercado',
            tax_rule_id: it.tax_rule_id || null,
            gtin: it.xml_ean || null,
            ncm: it.xml_ncm || null,
            cfop: cfopSaidaParaEntrada(it.xml_cfop),
            unit: it.stock_unit || it.xml_unidade || null,
            track_stock: true,
            product_type: it.product_type || 'mercado',
            pdv_item: it.pdv_item,
            menu_item: it.menu_item,
            waiter_item: it.waiter_item,
            qr_item: it.qr_item,
            active: true,
            stock_quantity: 0,
            supplier_id: supplierId,
          } as any).select('id').single();
          if (pErr) throw pErr;
          productId = (prod as any).id;
        } else if (productId) {
          // Atualiza custo, preço e garante rastreio de estoque no produto existente
          const { error: updateProductErr } = await (supabase.from('products') as any).update({
            cost_price: realCost,
            price: it.sale_price || undefined,
            track_stock: true,
          }).eq('id', productId);
          if (updateProductErr) throw updateProductErr;
          // Preenche GTIN no cadastro caso esteja vazio e o XML traga um EAN válido.
          const xmlEan = (it.xml_ean || '').trim();
          if (xmlEan && isValidGtin(xmlEan)) {
            const matched = products.find((p) => p.id === productId);
            const currentGtin = (matched?.gtin || '').trim();
            if (!currentGtin) {
              await (supabase.from('products') as any)
                .update({ gtin: xmlEan })
                .eq('id', productId);
              if (matched?.name) gtinUpdates.push(matched.name);
            } else if (normalizeGtin(currentGtin) !== normalizeGtin(xmlEan)) {
              if (matched?.name) gtinDivergentes.push(matched.name);
            }
          }
        }
        const { error: itemErr } = await supabase.from('purchase_invoice_items').insert({
          invoice_id: invoiceId, company_id: company.id, product_id: productId,
          xml_codigo: it.xml_codigo, xml_descricao: it.xml_descricao,
          xml_ean: it.xml_ean, xml_ncm: it.xml_ncm, xml_cfop: it.xml_cfop, xml_unidade: it.xml_unidade,
          quantidade: it.quantidade, valor_unitario: it.valor_unitario, valor_total: it.valor_total,
          conversion_factor: factor,
          stock_unit: it.stock_unit,
          sale_price: it.sale_price,
          unit_weight_kg: it.unit_weight_kg,
          stock_applied: !!productId,
        } as any).select('id').single();
        if (itemErr) throw itemErr;

        if (productId) {
          const { data: newBalance, error: stockErr } = await supabase.rpc('apply_stock_movement', {
            _product_id: productId, _qty: stockQty, _type: 'manual_in',
            _reference_type: 'purchase_invoice', _reference_id: invoiceId,
            _notes: `NF-e ${header.numero}/${header.serie} - ${header.nome_emit}${factor !== 1 ? ` (fator ${factor})` : ''}`,
          });
          if (stockErr) throw stockErr;
          if (newBalance === null) throw new Error(`Estoque não movimentado para ${it.newName || it.xml_descricao}. Verifique se o produto controla estoque.`);
        }
      }

      // 5) atualizar DFe
      if (dfeId) {
        await supabase.from('dfe_documentos').update({
          imported_at: new Date().toISOString(), imported_invoice_id: invoiceId,
        }).eq('id', dfeId);
      }

      toast.success('NF-e de entrada lançada e estoque atualizado!');
      if (gtinUpdates.length > 0) {
        toast.success(`GTIN preenchido em ${gtinUpdates.length} produto(s) sem código de barras cadastrado.`);
      }
      if (gtinDivergentes.length > 0) {
        toast.warning(`${gtinDivergentes.length} produto(s) com GTIN divergente do XML — não foram alterados.`);
      }
      navigate('/compras/entradas');
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || 'Erro ao lançar NF-e');
    } finally { setSaving(false); }
  }

  return (
    <AppLayout>
      <div className="container py-6 max-w-6xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Importar XML de NF-e</h1>
            <p className="text-muted-foreground text-sm">Lance uma NF-e de entrada e dê baixa de estoque automaticamente.</p>
          </div>
          <Button variant="outline" onClick={() => navigate('/compras/manifestacao')}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Voltar
          </Button>
        </div>

        {!header && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Upload className="w-4 h-4" /> Selecionar XML</CardTitle></CardHeader>
            <CardContent>
              {xmlUnavailable ? (
                <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-semibold text-amber-900 dark:text-amber-200 mb-1">
                        SEFAZ ainda não liberou o XML completo desta NF-e
                      </div>
                      <div className="text-amber-800 dark:text-amber-300">
                        {xmlUnavailable.message}
                      </div>
                    </div>
                  </div>
                  {xmlUnavailable.needsConfirmacao && dfeId && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      <Button
                        size="sm"
                        onClick={handleConfirmarOperacao}
                        disabled={confirmingOp}
                      >
                        {confirmingOp
                          ? <><Loader2 className="w-4 h-4 animate-spin mr-2" /> Confirmando…</>
                          : <><CheckCircle2 className="w-4 h-4 mr-2" /> Executar Confirmação da Operação agora</>}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => dfeId && loadFromDfe(dfeId)}
                        disabled={confirmingOp || loading}
                      >
                        Tentar baixar novamente
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => navigate('/compras/manifestacao')}
                      >
                        Voltar para Manifestação
                      </Button>
                    </div>
                  )}
                  <div className="text-xs text-muted-foreground">
                    A Ciência apenas registra que você tomou conhecimento do documento — para receber o XML com os itens é preciso executar a Confirmação da Operação e aguardar alguns minutos.
                  </div>
                </div>
              ) : (
                <Input type="file" accept=".xml,application/xml,text/xml" onChange={onFile} />
              )}
              {loading && <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Baixando XML…</div>}
            </CardContent>
          </Card>
        )}

        {header && (
          <>
            <Card className="mb-4">
              <CardHeader><CardTitle className="text-base">Cabeçalho da NF-e</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div><div className="text-muted-foreground">Fornecedor</div><div className="font-medium">{header.nome_emit}</div></div>
                <div><div className="text-muted-foreground">CNPJ</div><div className="font-mono">{header.cnpj_emit}</div></div>
                <div><div className="text-muted-foreground">NF-e / Série</div><div>{header.numero} / {header.serie}</div></div>
                <div><div className="text-muted-foreground">Valor total</div><div className="font-bold text-emerald-600">{header.valor_total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div></div>
                <div className="col-span-2 md:col-span-4 text-[11px] font-mono text-muted-foreground truncate">{header.chave}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Itens ({items.length})</CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Markup rápido:</span>
                  <Button size="sm" variant="outline" onClick={() => applyMarkupToAll(30)}>+30%</Button>
                  <Button size="sm" variant="outline" onClick={() => applyMarkupToAll(50)}>+50%</Button>
                  <Button size="sm" variant="outline" onClick={() => applyMarkupToAll(100)}>+100%</Button>
                  <Badge variant="outline">Soma: {totalCalc.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {items.some(i => i.createNew) && (
                  <div className="rounded-md border border-dashed p-3 bg-muted/30">
                    <div className="text-xs font-medium text-muted-foreground mb-2">
                      Ações em massa (aplicam-se apenas aos itens que criarão produto novo)
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div className="flex gap-2">
                        <Select value={bulkCategoryId} onValueChange={setBulkCategoryId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Categoria" /></SelectTrigger>
                          <SelectContent>
                            {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={bulkApplyCategory}>Aplicar</Button>
                      </div>
                      <div className="flex gap-2">
                        <Select value={bulkTaxRuleId} onValueChange={setBulkTaxRuleId}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Regra tributária" /></SelectTrigger>
                          <SelectContent>
                            {taxRules.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={bulkApplyTaxRule}>Aplicar</Button>
                      </div>
                      <div className="flex gap-2">
                        <Select value={bulkType} onValueChange={(v) => setBulkType(v as ProductType)}>
                          <SelectTrigger className="h-9"><SelectValue placeholder="Tipo do produto" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mercado">Mercado</SelectItem>
                            <SelectItem value="cardapio">Cardápio</SelectItem>
                            <SelectItem value="ambos">Ambos</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={bulkApplyType}>Aplicar</Button>
                      </div>
                    </div>
                  </div>
                )}
                {items.map((it, idx) => (
                  <div key={idx} className={cn('border rounded-lg p-3 space-y-2', it.skip && 'opacity-50 bg-muted/40')}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {it.skip && <Badge variant="destructive" className="text-[10px]">IGNORADO</Badge>}
                          <span className="truncate">{it.xml_descricao}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Cód {it.xml_codigo} · EAN {it.xml_ean || '—'} · NCM {it.xml_ncm} · CFOP {it.xml_cfop}
                          {cfopSaidaParaEntrada(it.xml_cfop) && cfopSaidaParaEntrada(it.xml_cfop) !== it.xml_cfop
                            ? ` → ${cfopSaidaParaEntrada(it.xml_cfop)} (entrada)`
                            : ''}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <div className="text-right text-sm">
                          <div>{it.quantidade} {it.xml_unidade}</div>
                          <div className="text-xs text-muted-foreground">{it.valor_unitario.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} un</div>
                          <div className="font-bold text-emerald-600">{it.valor_total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                        </div>
                        <Button
                          size="sm"
                          variant={it.skip ? 'outline' : 'ghost'}
                          className={cn('h-7 text-xs', !it.skip && 'text-destructive hover:text-destructive')}
                          onClick={() => updateItem(idx, { skip: !it.skip })}
                        >
                          {it.skip ? (<><Undo2 className="w-3 h-3 mr-1" /> Voltar a importar</>) : (<><Ban className="w-3 h-3 mr-1" /> Não importar</>)}
                        </Button>
                      </div>
                    </div>
                    {!it.skip && (<>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t">
                      <div>
                        <Label className="text-xs">Mapear para produto</Label>
                        {(() => {
                          const currentValue = it.product_id || (it.createNew ? '__new__' : '__skip__');
                          const currentLabel = it.product_id
                            ? (products.find(p => p.id === it.product_id)?.name || 'Produto')
                            : it.createNew ? '+ Criar novo produto' : 'Não vincular (sem estoque)';
                          const handleSelect = (v: string) => {
                            const copy = [...items];
                            const factor = copy[idx].conversion_factor > 0 ? copy[idx].conversion_factor : 1;
                            const realCost = copy[idx].valor_unitario / factor;
                            if (v === '__new__') {
                              copy[idx].product_id = null;
                              copy[idx].createNew = true;
                              copy[idx].sale_price = Number(realCost.toFixed(2));
                            } else if (v === '__skip__') {
                              copy[idx].product_id = null;
                              copy[idx].createNew = false;
                              copy[idx].sale_price = Number(realCost.toFixed(2));
                            } else {
                              copy[idx].product_id = v;
                              copy[idx].createNew = false;
                              const matched = products.find((p) => p.id === v);
                              copy[idx].sale_price = (matched?.price && matched.price > 0)
                                ? Number(matched.price)
                                : Number(realCost.toFixed(2));
                            }
                            setItems(copy);
                            setOpenMap((prev) => ({ ...prev, [idx]: false }));
                          };
                          return (
                            <Popover open={!!openMap[idx]} onOpenChange={(o) => setOpenMap((prev) => ({ ...prev, [idx]: o }))}>
                              <PopoverTrigger asChild>
                                <Button variant="outline" role="combobox" className="w-full justify-between font-normal">
                                  <span className="truncate">{currentLabel}</span>
                                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="p-0 w-[--radix-popover-trigger-width] max-w-[420px]" align="start">
                                <Command>
                                  <CommandInput placeholder="Pesquisar produto ou EAN..." />
                                  <CommandList>
                                    <CommandEmpty>Nenhum produto encontrado.</CommandEmpty>
                                    <CommandGroup>
                                      <CommandItem value="__new__ criar novo produto" onSelect={() => handleSelect('__new__')}>
                                        <Check className={cn('mr-2 h-4 w-4', currentValue === '__new__' ? 'opacity-100' : 'opacity-0')} />
                                        + Criar novo produto
                                      </CommandItem>
                                      <CommandItem value="__skip__ nao vincular sem estoque" onSelect={() => handleSelect('__skip__')}>
                                        <Check className={cn('mr-2 h-4 w-4', currentValue === '__skip__' ? 'opacity-100' : 'opacity-0')} />
                                        Não vincular (sem estoque)
                                      </CommandItem>
                                    </CommandGroup>
                                    <CommandGroup heading="Produtos cadastrados">
                                      {products.map((p) => (
                                        <CommandItem
                                          key={p.id}
                                          value={`${p.name} ${p.gtin || ''}`}
                                          onSelect={() => handleSelect(p.id)}
                                        >
                                          <Check className={cn('mr-2 h-4 w-4', currentValue === p.id ? 'opacity-100' : 'opacity-0')} />
                                          <span className="truncate">{p.name}</span>
                                          {p.gtin && <span className="ml-2 text-xs text-muted-foreground">{p.gtin}</span>}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          );
                        })()}
                      </div>
                      {it.createNew && (
                        <div>
                          <Label className="text-xs">Nome do novo produto</Label>
                          <Input value={it.newName} onChange={(e) => {
                            const copy = [...items]; copy[idx].newName = e.target.value; setItems(copy);
                          }} />
                        </div>
                      )}
                    </div>
                    {it.createNew && (
                      <div className="rounded-md border border-dashed p-3 space-y-3 bg-muted/20">
                        <div className="text-xs font-medium text-muted-foreground">Cadastro do novo produto</div>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Categoria</Label>
                            <Select
                              value={it.category_id || ''}
                              onValueChange={(v) => {
                                const cat = categories.find(c => c.id === v);
                                updateItem(idx, {
                                  category_id: v,
                                  category_name: cat?.name || it.category_name,
                                });
                              }}
                            >
                              <SelectTrigger className="h-9"><SelectValue placeholder="Selecione" /></SelectTrigger>
                              <SelectContent>
                                {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Regra tributária</Label>
                            <Select
                              value={it.tax_rule_id || 'none'}
                              onValueChange={(v) => updateItem(idx, { tax_rule_id: v === 'none' ? null : v })}
                            >
                              <SelectTrigger className="h-9"><SelectValue placeholder="Sem regra" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem regra</SelectItem>
                                {taxRules.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Tipo do produto</Label>
                            <Select
                              value={it.product_type}
                              onValueChange={(v) => {
                                const t = v as ProductType;
                                updateItem(idx, { product_type: t, ...visibilityFromType(t) });
                              }}
                            >
                              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="mercado">Mercado</SelectItem>
                                <SelectItem value="cardapio">Cardápio</SelectItem>
                                <SelectItem value="ambos">Ambos</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-4 text-xs">
                          <label className="flex items-center gap-2">
                            <Switch checked={it.pdv_item} onCheckedChange={(v) => updateItem(idx, { pdv_item: v })} />
                            Visível na Frente de Caixa
                          </label>
                          <label className="flex items-center gap-2">
                            <Switch checked={it.menu_item} onCheckedChange={(v) => updateItem(idx, { menu_item: v })} />
                            Visível no Cardápio
                          </label>
                          <label className="flex items-center gap-2">
                            <Switch checked={it.waiter_item} onCheckedChange={(v) => updateItem(idx, { waiter_item: v })} />
                            Visível no Garçom
                          </label>
                          <label className="flex items-center gap-2">
                            <Switch checked={it.qr_item} onCheckedChange={(v) => updateItem(idx, { qr_item: v })} />
                            Visível no QR de Mesa
                          </label>
                        </div>
                      </div>
                    )}
                    {/* Conversão + preço */}
                    {(it.product_id || it.createNew) && (() => {
                      const factor = it.conversion_factor > 0 ? it.conversion_factor : 1;
                      const stockQty = it.quantidade * factor;
                      const realCost = it.valor_unitario / factor;
                      const margin = it.sale_price > 0 && realCost > 0
                        ? ((it.sale_price - realCost) / it.sale_price) * 100
                        : 0;
                      return (
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-2 pt-2 border-t bg-muted/30 -mx-3 px-3 pb-2 rounded-b-lg">
                          <div>
                            <Label className="text-xs">Fator de conversão</Label>
                            <Input
                              type="number" step="0.0001" min="0.0001"
                              value={it.conversion_factor}
                              onChange={(e) => updateItem(idx, { conversion_factor: Number(e.target.value) || 1 })}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Un. estoque</Label>
                            <Select value={it.stock_unit} onValueChange={(v) => updateItem(idx, { stock_unit: v })}>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {['UN','KG','G','L','ML','PCT','CX','FD','DZ'].map(u => (
                                  <SelectItem key={u} value={u}>{u}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-xs">Qtd. p/ estoque</Label>
                            <Input value={`${stockQty.toLocaleString('pt-BR')} ${it.stock_unit}`} readOnly className="bg-background" />
                          </div>
                          <div>
                            <Label className="text-xs">Custo real</Label>
                            <Input
                              value={realCost.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
                              readOnly className="bg-background"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">
                              Preço de venda
                              {margin > 0 && <span className="text-emerald-600 ml-1">({margin.toFixed(0)}%)</span>}
                            </Label>
                            <Input
                              type="number" step="0.01" min="0"
                              value={it.sale_price}
                              onChange={(e) => updateItem(idx, { sale_price: Number(e.target.value) || 0 })}
                            />
                          </div>
                        </div>
                      );
                    })()}
                    </>)}
                  </div>
                ))}

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => { setHeader(null); setItems([]); setXmlText(''); }}>
                    Cancelar
                  </Button>
                  <Button
                    onClick={() => setConfirmOpen(true)}
                    disabled={saving || items.every(i => i.skip)}
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Confirmar entrada
                  </Button>
                </div>
              </CardContent>
            </Card>

            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirmar importação da NF-e</AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-2 text-sm">
                      <div className="rounded-md border p-3 bg-muted/30 space-y-1">
                        <div className="flex justify-between"><span className="text-muted-foreground">Itens na NF:</span><span className="font-medium">{items.length}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Itens importados:</span><span className="font-medium text-emerald-600">{items.filter(i => !i.skip).length}</span></div>
                        <div className="flex justify-between"><span className="text-muted-foreground">Itens ignorados:</span><span className="font-medium text-destructive">{items.filter(i => i.skip).length}</span></div>
                        <div className="flex justify-between border-t pt-1 mt-1"><span className="text-muted-foreground">Valor da NF (XML):</span><span className="font-bold">{(header?.valor_total || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</span></div>
                      </div>
                      {items.some(i => i.skip) && (
                        <div className="text-xs text-muted-foreground">
                          O valor total fiscal da NF é mantido conforme o XML. Apenas os itens marcados como “Não importar” serão ignorados no lançamento e na entrada de estoque.
                        </div>
                      )}
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={saving}>Voltar</AlertDialogCancel>
                  <AlertDialogAction
                    disabled={saving}
                    onClick={(e) => { e.preventDefault(); setConfirmOpen(false); handleConfirm(); }}
                  >
                    Confirmar entrada
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </>
        )}
      </div>
    </AppLayout>
  );
}