import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/ui/currency-input';

type Item = {
  product_id: string | null;
  descricao: string;
  ncm: string;
  cfop: string;
  cest?: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  cst_pis?: string;
  cst_cofins?: string;
  aliquota_pis?: number;
  aliquota_cofins?: number;
};

export default function NFeEmissaoAvulsa() {
  const { company } = useAuthContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Settings carregados de pdv_settings
  const [serie, setSerie] = useState('1');
  const [ambiente, setAmbiente] = useState<'homologacao' | 'producao'>('homologacao');
  const [naturezaOperacao, setNaturezaOperacao] = useState('Venda');
  const [finalidade, setFinalidade] = useState<number>(1);

  // Destinatário (PJ obrigatório na Fase 1)
  const [destCnpj, setDestCnpj] = useState('');
  const [destRazao, setDestRazao] = useState('');
  const [destIE, setDestIE] = useState('');
  const [destLogradouro, setDestLogradouro] = useState('');
  const [destNumero, setDestNumero] = useState('');
  const [destBairro, setDestBairro] = useState('');
  const [destCidade, setDestCidade] = useState('');
  const [destUF, setDestUF] = useState('RS');
  const [destCep, setDestCep] = useState('');

  // Itens
  const [items, setItems] = useState<Item[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);

  useEffect(() => {
    if (!company?.id) return;
    supabase.from('pdv_settings').select('*').eq('company_id', company.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if ((data as any).nfe_serie) setSerie((data as any).nfe_serie);
        if ((data as any).nfe_ambiente) setAmbiente((data as any).nfe_ambiente);
        if ((data as any).nfe_natureza_operacao) setNaturezaOperacao((data as any).nfe_natureza_operacao);
        if ((data as any).nfe_finalidade) setFinalidade((data as any).nfe_finalidade);
      });
  }, [company?.id]);

  useEffect(() => {
    if (!company?.id || productSearch.trim().length < 2) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('products')
        .select('id, name, ncm, cfop, cest, cst_pis, cst_cofins, aliquota_pis, aliquota_cofins, sale_price, unit')
        .eq('company_id', company.id)
        .ilike('name', `%${productSearch}%`)
        .limit(10);
      setProductResults((data as any) || []);
    }, 250);
    return () => clearTimeout(t);
  }, [productSearch, company?.id]);

  function addProduct(p: any) {
    setItems(prev => [...prev, {
      product_id: p.id,
      descricao: p.name,
      ncm: p.ncm || '',
      cfop: p.cfop || '5102',
      cest: p.cest || undefined,
      unidade: p.unit || 'UN',
      quantidade: 1,
      valor_unitario: Number(p.sale_price) || 0,
      cst_pis: p.cst_pis || '49',
      cst_cofins: p.cst_cofins || '49',
      aliquota_pis: Number(p.aliquota_pis) || 0,
      aliquota_cofins: Number(p.aliquota_cofins) || 0,
    }]);
    setProductSearch('');
    setProductResults([]);
  }

  function addManualItem() {
    setItems(prev => [...prev, {
      product_id: null,
      descricao: '',
      ncm: '',
      cfop: '5102',
      unidade: 'UN',
      quantidade: 1,
      valor_unitario: 0,
      cst_pis: '49',
      cst_cofins: '49',
    }]);
  }

  function updateItem(idx: number, patch: Partial<Item>) {
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  }

  function removeItem(idx: number) {
    setItems(prev => prev.filter((_, i) => i !== idx));
  }

  const valorTotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0),
    [items],
  );

  function validate(): string | null {
    if (!destCnpj.replace(/\D/g, '')) return 'CNPJ do destinatário é obrigatório.';
    if (destCnpj.replace(/\D/g, '').length !== 14) return 'CNPJ inválido.';
    if (!destRazao.trim()) return 'Razão social do destinatário é obrigatória.';
    if (!destLogradouro.trim() || !destCidade.trim() || !destUF.trim()) return 'Endereço do destinatário incompleto.';
    if (items.length === 0) return 'Adicione pelo menos 1 item.';
    for (const it of items) {
      if (!it.descricao.trim()) return 'Item sem descrição.';
      if (!it.ncm || it.ncm.length < 8) return `NCM inválido em "${it.descricao}".`;
      if (!it.cfop) return `CFOP obrigatório em "${it.descricao}".`;
      if (!it.quantidade || it.quantidade <= 0) return `Quantidade inválida em "${it.descricao}".`;
      if (!it.valor_unitario || it.valor_unitario <= 0) return `Valor unitário inválido em "${it.descricao}".`;
    }
    return null;
  }

  async function emitir() {
    const err = validate();
    if (err) { toast.error(err); return; }
    if (!company?.id) return;
    setLoading(true);
    try {
      const payload = {
        serie,
        ambiente,
        natureza_operacao: naturezaOperacao,
        finalidade,
        destinatario: {
          cnpj: destCnpj.replace(/\D/g, ''),
          razao_social: destRazao,
          inscricao_estadual: destIE || undefined,
          endereco: {
            logradouro: destLogradouro,
            numero: destNumero,
            bairro: destBairro,
            municipio: destCidade,
            uf: destUF,
            cep: destCep.replace(/\D/g, ''),
          },
          indIEDest: destIE ? '1' : '9',
        },
        itens: items,
        valor_total: valorTotal,
      };

      const { data, error } = await supabase.functions.invoke('nfe-proxy', {
        body: { action: 'emitir', companyId: company.id, payload },
      });
      if (error) throw error;
      if (!data?.ok) {
        const motivo = data?.result?.data?.message || data?.result?.error || 'Falha na emissão';
        toast.error(`NF-e rejeitada: ${motivo}`);
        navigate('/nfe');
        return;
      }
      toast.success('NF-e emitida com sucesso!');
      navigate('/nfe');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao emitir NF-e');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Nova NF-e</h1>
          <p className="text-sm text-muted-foreground">Emissão avulsa de Nota Fiscal Eletrônica (modelo 55).</p>
        </div>

        {/* Cabeçalho */}
        <Card>
          <CardHeader><CardTitle className="text-base">Cabeçalho</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Série</Label><Input value={serie} onChange={e => setSerie(e.target.value)} /></div>
            <div>
              <Label>Ambiente</Label>
              <Select value={ambiente} onValueChange={(v: any) => setAmbiente(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="homologacao">Homologação</SelectItem>
                  <SelectItem value="producao">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>Natureza da Operação</Label>
              <Input value={naturezaOperacao} onChange={e => setNaturezaOperacao(e.target.value)} />
            </div>
          </CardContent>
        </Card>

        {/* Destinatário */}
        <Card>
          <CardHeader><CardTitle className="text-base">Destinatário (PJ)</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-1"><Label>CNPJ *</Label><Input value={destCnpj} onChange={e => setDestCnpj(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Razão social *</Label><Input value={destRazao} onChange={e => setDestRazao(e.target.value)} /></div>
            <div><Label>Inscrição Estadual</Label><Input value={destIE} onChange={e => setDestIE(e.target.value)} placeholder="ou ISENTO" /></div>
            <div className="md:col-span-2"><Label>Logradouro *</Label><Input value={destLogradouro} onChange={e => setDestLogradouro(e.target.value)} /></div>
            <div><Label>Número</Label><Input value={destNumero} onChange={e => setDestNumero(e.target.value)} /></div>
            <div><Label>Bairro</Label><Input value={destBairro} onChange={e => setDestBairro(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Município *</Label><Input value={destCidade} onChange={e => setDestCidade(e.target.value)} /></div>
            <div><Label>UF *</Label><Input value={destUF} maxLength={2} onChange={e => setDestUF(e.target.value.toUpperCase())} /></div>
            <div><Label>CEP</Label><Input value={destCep} onChange={e => setDestCep(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Itens */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">Itens</CardTitle>
            <Button variant="outline" size="sm" onClick={addManualItem}>
              <Plus className="w-4 h-4 mr-1" /> Item manual
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Buscar produto pelo nome…"
                value={productSearch}
                onChange={e => setProductSearch(e.target.value)}
              />
              {productResults.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                  {productResults.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      onClick={() => addProduct(p)}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="text-muted-foreground ml-2">R$ {Number(p.sale_price || 0).toFixed(2).replace('.', ',')}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {items.length === 0 ? (
              <div className="text-center text-muted-foreground py-6 text-sm">Nenhum item adicionado.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr className="text-left">
                      <th className="px-2 py-1">Descrição</th>
                      <th className="px-2 py-1 w-24">NCM</th>
                      <th className="px-2 py-1 w-20">CFOP</th>
                      <th className="px-2 py-1 w-16">UN</th>
                      <th className="px-2 py-1 w-24">Qtd</th>
                      <th className="px-2 py-1 w-32">Vlr Unit.</th>
                      <th className="px-2 py-1 w-28">Total</th>
                      <th className="px-2 py-1 w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((it, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-2 py-1"><Input value={it.descricao} onChange={e => updateItem(idx, { descricao: e.target.value })} /></td>
                        <td className="px-2 py-1"><Input value={it.ncm} onChange={e => updateItem(idx, { ncm: e.target.value })} /></td>
                        <td className="px-2 py-1"><Input value={it.cfop} onChange={e => updateItem(idx, { cfop: e.target.value })} /></td>
                        <td className="px-2 py-1"><Input value={it.unidade} onChange={e => updateItem(idx, { unidade: e.target.value })} /></td>
                        <td className="px-2 py-1"><Input type="number" value={it.quantidade} onChange={e => updateItem(idx, { quantidade: Number(e.target.value) })} /></td>
                        <td className="px-2 py-1">
                          <CurrencyInput value={it.valor_unitario} onValueChange={(v) => updateItem(idx, { valor_unitario: v })} />
                        </td>
                        <td className="px-2 py-1 text-right font-medium">
                          R$ {((it.quantidade || 0) * (it.valor_unitario || 0)).toFixed(2).replace('.', ',')}
                        </td>
                        <td className="px-2 py-1">
                          <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30">
                      <td className="px-2 py-2 font-medium" colSpan={6}>Total</td>
                      <td className="px-2 py-2 text-right font-bold">R$ {valorTotal.toFixed(2).replace('.', ',')}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/nfe')}>Cancelar</Button>
          <Button onClick={emitir} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Emitir NF-e
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}