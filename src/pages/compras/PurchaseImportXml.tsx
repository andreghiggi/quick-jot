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
import { toast } from 'sonner';
import { Upload, Loader2, CheckCircle2, FileInput, ChevronLeft, Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  // --- Conversão / preço (Fase 1) ---
  conversion_factor: number;   // ex.: fardo c/ 15 → 15
  stock_unit: string;          // unidade que entra no estoque
  sale_price: number;          // preço sugerido de venda
  unit_weight_kg: number | null; // opcional, p/ KG→UN
};

type Header = {
  chave: string;
  cnpj_emit: string;
  nome_emit: string;
  numero: string;
  serie: string;
  emissao: string;
  valor_total: number;
};

type ProductSlim = { id: string; name: string; gtin: string | null; price: number | null; unit: string | null };

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
  const [dfeId, setDfeId] = useState<string | null>(documentoId);
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!company?.id) return;
    supabase.from('products').select('id,name,gtin,price,unit').eq('company_id', company.id).then(({ data }) => {
      setProducts((data as any) || []);
    });
    if (documentoId) loadFromDfe(documentoId);
  }, [company?.id, documentoId]);

  async function loadFromDfe(id: string) {
    if (!company?.id) return;
    setLoading(true);
    try {
      const { data: doc } = await supabase.from('dfe_documentos')
        .select('*').eq('id', id).maybeSingle();
      if (!doc) throw new Error('Documento não encontrado');
      // Garantir XML baixado
      let xmlPath = (doc as any).xml_path;
      if (!xmlPath) {
        const { data } = await supabase.functions.invoke('dfe-fiscalflow-proxy', {
          body: { companyId: company.id, action: 'download_xml', documentoId: id },
        });
        if (data?.error) throw new Error(data.error);
        xmlPath = data?.xml_path;
        if (data?.xml) { parseXml(data.xml); setLoading(false); return; }
      }
      const { data: file } = await supabase.storage.from('dfe-xmls').download(xmlPath);
      if (!file) throw new Error('XML não encontrado no storage');
      const text = await file.text();
      parseXml(text);
    } catch (e: any) {
      toast.error(e.message || 'Erro ao carregar XML');
    } finally { setLoading(false); }
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => parseXml(String(reader.result || ''));
    reader.readAsText(f);
  }

  function parseXml(text: string) {
    setXmlText(text);
    try {
      const doc = new DOMParser().parseFromString(text, 'text/xml');
      const get = (el: Element | null, tag: string) =>
        el?.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
      const infNFe = doc.getElementsByTagName('infNFe')[0];
      if (!infNFe) throw new Error('XML não é uma NF-e válida (infNFe ausente)');
      const chave = (infNFe.getAttribute('Id') || '').replace(/^NFe/, '');
      const emit = infNFe.getElementsByTagName('emit')[0];
      const ide = infNFe.getElementsByTagName('ide')[0];
      const total = infNFe.getElementsByTagName('total')[0]?.getElementsByTagName('ICMSTot')[0];
      const h: Header = {
        chave,
        cnpj_emit: get(emit, 'CNPJ'),
        nome_emit: get(emit, 'xNome'),
        numero: get(ide, 'nNF'),
        serie: get(ide, 'serie'),
        emissao: get(ide, 'dhEmi') || get(ide, 'dEmi'),
        valor_total: Number(get(total, 'vNF') || 0),
      };
      setHeader(h);

      const dets = Array.from(infNFe.getElementsByTagName('det'));
      const its: ItemRow[] = dets.map((det) => {
        const prod = det.getElementsByTagName('prod')[0];
        const ean = get(prod, 'cEAN');
        const descricao = get(prod, 'xProd');
        const matched = products.find(p => (ean && p.gtin === ean));
        const uCom = get(prod, 'uCom');
        const vUn = Number(get(prod, 'vUnCom') || 0);
        return {
          xml_codigo: get(prod, 'cProd'),
          xml_descricao: descricao,
          xml_ean: ean && ean !== 'SEM GTIN' ? ean : '',
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
        };
      });
      setItems(its);
      toast.success(`${its.length} item(ns) lido(s) do XML`);
    } catch (e: any) {
      toast.error(e.message || 'XML inválido');
    }
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

  async function handleConfirm() {
    if (!company?.id || !header) return;
    setSaving(true);
    try {
      // 1) supplier: busca por CNPJ, cria se não existir
      let supplierId: string | null = null;
      if (header.cnpj_emit) {
        const { data: sup } = await (supabase.from('suppliers') as any)
          .select('id').eq('company_id', company.id).eq('cnpj', header.cnpj_emit).maybeSingle();
        if (sup) supplierId = (sup as any).id;
        else {
          const { data: novo } = await (supabase.from('suppliers') as any).insert({
            company_id: company.id, name: header.nome_emit || 'Fornecedor', cnpj: header.cnpj_emit,
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
      for (const it of items) {
        const factor = it.conversion_factor > 0 ? it.conversion_factor : 1;
        const stockQty = it.quantidade * factor;
        const realCost = it.valor_unitario / factor;
        let productId = it.product_id;
        if (!productId && it.createNew) {
          const { data: prod, error: pErr } = await supabase.from('products').insert({
            company_id: company.id,
            name: it.newName || it.xml_descricao,
            price: it.sale_price || realCost,
            cost_price: realCost,
            gtin: it.xml_ean || null,
            ncm: it.xml_ncm || null,
            cfop: it.xml_cfop || null,
            unit: it.stock_unit || it.xml_unidade || null,
            track_stock: true,
            product_type: 'mercado',
            active: true,
            stock_quantity: 0,
          } as any).select('id').single();
          if (pErr) throw pErr;
          productId = (prod as any).id;
        } else if (productId) {
          // Atualiza custo e preço do produto existente
          await (supabase.from('products') as any).update({
            cost_price: realCost,
            price: it.sale_price || undefined,
          }).eq('id', productId);
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
            } else if (currentGtin !== xmlEan) {
              if (matched?.name) gtinDivergentes.push(matched.name);
            }
          }
        }
        const { data: itemRow } = await supabase.from('purchase_invoice_items').insert({
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

        if (productId) {
          await supabase.rpc('apply_stock_movement', {
            _product_id: productId, _qty: stockQty, _type: 'entrada',
            _reference_type: 'purchase_invoice', _reference_id: invoiceId,
            _notes: `NF-e ${header.numero}/${header.serie} - ${header.nome_emit}${factor !== 1 ? ` (fator ${factor})` : ''}`,
          });
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
              <Input type="file" accept=".xml,application/xml,text/xml" onChange={onFile} />
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
                {items.map((it, idx) => (
                  <div key={idx} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{it.xml_descricao}</div>
                        <div className="text-xs text-muted-foreground">
                          Cód {it.xml_codigo} · EAN {it.xml_ean || '—'} · NCM {it.xml_ncm} · CFOP {it.xml_cfop}
                        </div>
                      </div>
                      <div className="text-right text-sm">
                        <div>{it.quantidade} {it.xml_unidade}</div>
                        <div className="text-xs text-muted-foreground">{it.valor_unitario.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})} un</div>
                        <div className="font-bold text-emerald-600">{it.valor_total.toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}</div>
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-2 border-t">
                      <div>
                        <Label className="text-xs">Mapear para produto</Label>
                        <Select
                          value={it.product_id || (it.createNew ? '__new__' : '__skip__')}
                          onValueChange={(v) => {
                            const copy = [...items];
                            const factor = copy[idx].conversion_factor > 0 ? copy[idx].conversion_factor : 1;
                            const realCost = copy[idx].valor_unitario / factor;
                            if (v === '__new__') {
                              copy[idx].product_id = null;
                              copy[idx].createNew = true;
                              // novo produto: sugere custo real (sem markup) como ponto de partida
                              copy[idx].sale_price = Number(realCost.toFixed(2));
                            } else if (v === '__skip__') {
                              copy[idx].product_id = null;
                              copy[idx].createNew = false;
                              copy[idx].sale_price = Number(realCost.toFixed(2));
                            } else {
                              copy[idx].product_id = v;
                              copy[idx].createNew = false;
                              // Puxa preço de venda atual do produto cadastrado.
                              // Fallback p/ custo real quando o produto não tem preço cadastrado.
                              const matched = products.find((p) => p.id === v);
                              copy[idx].sale_price = (matched?.price && matched.price > 0)
                                ? Number(matched.price)
                                : Number(realCost.toFixed(2));
                            }
                            setItems(copy);
                          }}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__new__">+ Criar novo produto</SelectItem>
                            <SelectItem value="__skip__">Não vincular (sem estoque)</SelectItem>
                            {products.map(p => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.name}{p.gtin ? ` · ${p.gtin}` : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
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
                  </div>
                ))}

                <div className="flex justify-end gap-2 pt-2 border-t">
                  <Button variant="outline" onClick={() => { setHeader(null); setItems([]); setXmlText(''); }}>
                    Cancelar
                  </Button>
                  <Button onClick={handleConfirm} disabled={saving}>
                    {saving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                    Confirmar entrada
                  </Button>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </AppLayout>
  );
}