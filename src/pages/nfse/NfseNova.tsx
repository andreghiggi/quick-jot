import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, AlertTriangle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/ui/currency-input';
import { NFSE_CTRIBNAC } from '@/data/nfse-ctribnac';
import { NFSE_NBS_POR_SUBITEM, NFSE_NBS_NOMES } from '@/data/nfse-nbs';
import { validarNfse, type Problema } from '@/utils/nfseValidacao';

export default function NfseNova() {
  const { company } = useAuthContext();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  // Configuração carregada de pdv_settings
  const [ambiente, setAmbiente] = useState<'homologacao' | 'producao'>('homologacao');
  const [serie, setSerie] = useState('1');
  const [municipioPrestacao, setMunicipioPrestacao] = useState('');
  const [tokenOk, setTokenOk] = useState(true);
  const [problemasCadastro, setProblemasCadastro] = useState<Problema[]>([]);

  // Tomador
  const [destDoc, setDestDoc] = useState('');
  const [destNome, setDestNome] = useState('');
  const [destEmail, setDestEmail] = useState('');
  const [destIM, setDestIM] = useState('');
  const [destLogradouro, setDestLogradouro] = useState('');
  const [destNumero, setDestNumero] = useState('');
  const [destBairro, setDestBairro] = useState('');
  const [destMunicipioIbge, setDestMunicipioIbge] = useState('');
  const [destUF, setDestUF] = useState('RS');
  const [destCep, setDestCep] = useState('');

  // Serviço
  const [discriminacao, setDiscriminacao] = useState('');
  const [cTribNacBusca, setCTribNacBusca] = useState('');
  const [cTribNac, setCTribNac] = useState('');
  const [nbs, setNbs] = useState('');
  const [cTribMun, setCTribMun] = useState('');

  // Valores
  const [valorServico, setValorServico] = useState(0);
  const [desconto, setDesconto] = useState(0);
  const [deducoes, setDeducoes] = useState(0);
  const [aliquota, setAliquota] = useState(0);
  const [issRetido, setIssRetido] = useState(false);

  useEffect(() => {
    if (!company?.id) return;
    supabase.from('pdv_settings').select('nfse_ambiente, nfse_serie, nfse_codigo_municipio').eq('company_id', company.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        if (data.nfse_ambiente) setAmbiente(data.nfse_ambiente as any);
        if (data.nfse_serie) setSerie(data.nfse_serie);
        if (data.nfse_codigo_municipio) setMunicipioPrestacao(data.nfse_codigo_municipio);
      });
    supabase.from('store_settings').select('value').eq('company_id', company.id).eq('key', 'fiscal_flow_api_token').maybeSingle()
      .then(({ data }) => setTokenOk(!!data?.value?.trim()));
    supabase.functions.invoke('nfse-proxy', { body: { action: 'pre-validacao', companyId: company.id } })
      .then(({ data }) => { if (data?.problemas) setProblemasCadastro(data.problemas); });
  }, [company?.id]);

  const cTribNacResultados = useMemo(() => {
    const termo = cTribNacBusca.trim().toLowerCase();
    if (termo.length < 2) return [];
    return NFSE_CTRIBNAC.filter(([cod, desc]) => cod.includes(termo) || desc.toLowerCase().includes(termo)).slice(0, 15);
  }, [cTribNacBusca]);

  const nbsSugeridos = useMemo(() => {
    const subitem = cTribNac.slice(0, 4);
    const lista = NFSE_NBS_POR_SUBITEM[subitem] || [];
    return lista.map((cod) => ({ codigo: cod, nome: NFSE_NBS_NOMES[cod] || cod }));
  }, [cTribNac]);

  const baseCalculo = Math.max(0, valorServico - desconto - deducoes);
  const valorIss = Math.round(baseCalculo * (aliquota / 100) * 100) / 100;

  const problemas = useMemo(() => validarNfse({
    tokenOk,
    documento: destDoc,
    nome: destNome,
    descricao: discriminacao,
    valorServico,
    municipioPrestacao,
    codTribNac: cTribNac,
    nbs,
    tomadorTemEndereco: !!(destLogradouro.trim() && destCep.replace(/\D/g, '').length === 8),
    ambienteHomologacao: ambiente === 'homologacao',
  }), [tokenOk, destDoc, destNome, discriminacao, valorServico, municipioPrestacao, cTribNac, nbs, destLogradouro, destCep, ambiente]);

  const todosProblemas = [...problemasCadastro, ...problemas];
  const temErro = todosProblemas.some((p) => p.nivel === 'erro');

  async function emitir() {
    if (temErro) { toast.error('Corrija os problemas indicados antes de emitir.'); return; }
    if (!company?.id) return;
    setLoading(true);
    try {
      const payload = {
        serie,
        tomador: {
          documento: destDoc.replace(/\D/g, ''),
          nome: destNome,
          email: destEmail || undefined,
          im: destIM || undefined,
          endereco: destLogradouro ? {
            logradouro: destLogradouro,
            numero: destNumero,
            bairro: destBairro,
            codigoMunicipioIbge: destMunicipioIbge || municipioPrestacao,
            uf: destUF,
            cep: destCep.replace(/\D/g, ''),
          } : undefined,
        },
        servico: {
          discriminacao,
          codigo_municipio_prestacao: municipioPrestacao,
          c_trib_nac: cTribNac,
          c_nbs: nbs || undefined,
          c_trib_mun: cTribMun || undefined,
        },
        valores: {
          valor_servicos: valorServico,
          deducoes,
          desconto,
          aliquota,
          iss_retido: issRetido,
        },
      };

      const { data, error } = await supabase.functions.invoke('nfse-proxy', {
        body: { action: 'emitir', companyId: company.id, payload },
      });
      if (error) throw error;
      if (!data?.ok) {
        toast.error(`NFS-e rejeitada: ${data?.error || 'Falha na emissão'}`);
        navigate('/nfse');
        return;
      }
      toast.success('NFS-e emitida com sucesso!');
      navigate('/nfse');
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Erro ao emitir NFS-e');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Nova NFS-e</h1>
          <p className="text-sm text-muted-foreground">Emissão de Nota Fiscal de Serviço Eletrônica (padrão nacional).</p>
        </div>

        {todosProblemas.length > 0 && (
          <div className="space-y-2">
            {todosProblemas.map((p, i) => (
              <div
                key={i}
                className={`flex items-start gap-2 rounded-md border p-3 text-sm ${p.nivel === 'erro' ? 'border-destructive/40 bg-destructive/5 text-destructive' : 'border-amber-400/40 bg-amber-50 text-amber-800'}`}
              >
                {p.nivel === 'erro' ? <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />}
                <span>{p.mensagem}</span>
              </div>
            ))}
          </div>
        )}

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
              <Label>Município de prestação (IBGE) *</Label>
              <Input value={municipioPrestacao} onChange={e => setMunicipioPrestacao(e.target.value.replace(/\D/g, ''))} maxLength={7} placeholder="7 dígitos" />
            </div>
          </CardContent>
        </Card>

        {/* Tomador */}
        <Card>
          <CardHeader><CardTitle className="text-base">Tomador</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>CPF/CNPJ *</Label><Input value={destDoc} onChange={e => setDestDoc(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Nome / Razão social *</Label><Input value={destNome} onChange={e => setDestNome(e.target.value)} /></div>
            <div><Label>Inscrição Municipal</Label><Input value={destIM} onChange={e => setDestIM(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>E-mail</Label><Input value={destEmail} onChange={e => setDestEmail(e.target.value)} /></div>
            <div className="md:col-span-2"><Label>Logradouro</Label><Input value={destLogradouro} onChange={e => setDestLogradouro(e.target.value)} /></div>
            <div><Label>Número</Label><Input value={destNumero} onChange={e => setDestNumero(e.target.value)} /></div>
            <div><Label>Bairro</Label><Input value={destBairro} onChange={e => setDestBairro(e.target.value)} /></div>
            <div><Label>Município (IBGE)</Label><Input value={destMunicipioIbge} onChange={e => setDestMunicipioIbge(e.target.value.replace(/\D/g, ''))} maxLength={7} placeholder="padrão: da prestação" /></div>
            <div><Label>UF</Label><Input value={destUF} maxLength={2} onChange={e => setDestUF(e.target.value.toUpperCase())} /></div>
            <div><Label>CEP</Label><Input value={destCep} onChange={e => setDestCep(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Serviço */}
        <Card>
          <CardHeader><CardTitle className="text-base">Serviço</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-4">
              <Label>Descrição do serviço * (mín. 10 caracteres)</Label>
              <Input value={discriminacao} onChange={e => setDiscriminacao(e.target.value)} />
            </div>
            <div className="md:col-span-2 relative">
              <Label>Código de Tributação Nacional *</Label>
              <Input
                placeholder="Buscar por código ou descrição…"
                value={cTribNac ? `${cTribNac} — ${NFSE_CTRIBNAC.find(([c]) => c === cTribNac)?.[1] || ''}` : cTribNacBusca}
                onChange={e => { setCTribNac(''); setCTribNacBusca(e.target.value); }}
              />
              {cTribNacResultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                  {cTribNacResultados.map(([cod, desc]) => (
                    <button
                      key={cod}
                      type="button"
                      className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm"
                      onClick={() => { setCTribNac(cod); setCTribNacBusca(''); setNbs(''); }}
                    >
                      <span className="font-mono font-medium">{cod}</span>
                      <span className="text-muted-foreground ml-2">{desc}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>NBS (opcional)</Label>
              <Select value={nbs || '__none__'} onValueChange={(v) => setNbs(v === '__none__' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {nbsSugeridos.map((n) => (
                    <SelectItem key={n.codigo} value={n.codigo}>{n.codigo} — {n.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Cód. Trib. Municipal (opcional)</Label><Input value={cTribMun} onChange={e => setCTribMun(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Valores */}
        <Card>
          <CardHeader><CardTitle className="text-base">Valores</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div><Label>Valor do serviço *</Label><CurrencyInput value={valorServico} onValueChange={setValorServico} /></div>
            <div><Label>Desconto</Label><CurrencyInput value={desconto} onValueChange={setDesconto} /></div>
            <div><Label>Deduções da base de cálculo</Label><CurrencyInput value={deducoes} onValueChange={setDeducoes} /></div>
            <div><Label>Alíquota ISS (%)</Label><Input type="number" step="0.01" value={aliquota} onChange={e => setAliquota(Number(e.target.value))} /></div>
            <div><Label>Base de cálculo</Label><Input disabled value={`R$ ${baseCalculo.toFixed(2).replace('.', ',')}`} /></div>
            <div><Label>Valor do ISS (estimado)</Label><Input disabled value={`R$ ${valorIss.toFixed(2).replace('.', ',')}`} /></div>
            <div className="flex items-center gap-2 pt-6">
              <Checkbox checked={issRetido} onCheckedChange={(v) => setIssRetido(!!v)} id="iss-retido" />
              <Label htmlFor="iss-retido">ISS retido na fonte</Label>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate('/nfse')}>Cancelar</Button>
          <Button onClick={emitir} disabled={loading || temErro}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Emitir NFS-e
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
