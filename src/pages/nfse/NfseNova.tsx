import { useEffect, useMemo, useRef, useState } from 'react';
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
import { Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/ui/currency-input';
import { NFSE_CTRIBNAC } from '@/data/nfse-ctribnac';
import { NFSE_CTRIBNAC_POR_CNAE } from '@/data/nfse-cnae-ctribnac';
import { NFSE_NBS_POR_SUBITEM, NFSE_NBS_NOMES } from '@/data/nfse-nbs';
import { sugerirServicoPadrao } from '@/data/nfse-segmento-padrao';
import { validarNfse, cpfValido, cnpjValido, type Problema } from '@/utils/nfseValidacao';
import { formatCep, formatCpfCnpj, lookupCep, onlyDigits } from '@/lib/fiscalPerson';

/** Erro discreto sob o campo (só aparece depois que o usuário passou pelo campo ou tentou emitir). */
function ErroCampo({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="mt-1 text-xs text-destructive">{msg}</p>;
}

const invalido = (msg?: string) => (msg ? 'border-destructive focus-visible:ring-destructive' : '');

const NOME_TIPO_PADRAO_KEY = 'nfse_servico_padrao';

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
  const [cnae, setCnae] = useState<{ codigo: string; descricao: string } | null>(null);
  const [nomeEmpresa, setNomeEmpresa] = useState('');
  const [padraoSalvo, setPadraoSalvo] = useState<null | { c_trib_nac?: string; nbs?: string; discriminacao?: string; aliquota?: number }>(null);
  const [origemPadrao, setOrigemPadrao] = useState<string | null>(null);
  const [salvandoPadrao, setSalvandoPadrao] = useState(false);

  // Validação discreta: erros só aparecem no campo, depois de tocado ou de tentar emitir.
  const [tentou, setTentou] = useState(false);
  const [tocados, setTocados] = useState<Record<string, boolean>>({});
  const toca = (campo: string) => setTocados((t) => (t[campo] ? t : { ...t, [campo]: true }));
  const mostrar = (campo: string) => tentou || !!tocados[campo];

  // Tomador
  const [clienteBusca, setClienteBusca] = useState('');
  const [clienteResultados, setClienteResultados] = useState<any[]>([]);
  const [destDoc, setDestDoc] = useState('');
  const [destNome, setDestNome] = useState('');
  const [destEmail, setDestEmail] = useState('');
  const [destIM, setDestIM] = useState('');
  const [destLogradouro, setDestLogradouro] = useState('');
  const [destNumero, setDestNumero] = useState('');
  const [destComplemento, setDestComplemento] = useState('');
  const [destBairro, setDestBairro] = useState('');
  const [destCidade, setDestCidade] = useState('');
  const [destMunicipioIbge, setDestMunicipioIbge] = useState('');
  const [destUF, setDestUF] = useState('RS');
  const [destCep, setDestCep] = useState('');
  const cepIdentity = useRef(0);

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

  // Carga inicial: configuração, dados da empresa, padrão salvo e CNAE. Depois de tudo
  // carregado, pré-preenche município de prestação e serviço padrão (sem sobrescrever nada
  // que o usuário já tenha digitado).
  useEffect(() => {
    if (!company?.id) return;
    let ativo = true;
    (async () => {
      const [settingsRes, companyRes, tokenRes, padraoRes, preRes] = await Promise.all([
        (supabase as any).from('pdv_settings').select('nfse_ambiente, nfse_serie, nfse_codigo_municipio').eq('company_id', company.id).maybeSingle(),
        (supabase as any).from('companies').select('name, address_cep').eq('id', company.id).maybeSingle(),
        supabase.from('store_settings').select('value').eq('company_id', company.id).eq('key', 'fiscal_flow_api_token').maybeSingle(),
        supabase.from('store_settings').select('value').eq('company_id', company.id).eq('key', NOME_TIPO_PADRAO_KEY).maybeSingle(),
        supabase.functions.invoke('nfse-proxy', { body: { action: 'pre-validacao', companyId: company.id } }),
      ]);
      if (!ativo) return;

      const settings = settingsRes?.data;
      if (settings?.nfse_ambiente) setAmbiente(settings.nfse_ambiente as any);
      if (settings?.nfse_serie) setSerie(settings.nfse_serie);
      setTokenOk(!!tokenRes?.data?.value?.trim());
      if (preRes?.data?.problemas) setProblemasCadastro(preRes.data.problemas);
      const cnaeEmpresa = preRes?.data?.cnae || null;
      if (cnaeEmpresa) setCnae(cnaeEmpresa);

      const nome = String(companyRes?.data?.name || '');
      setNomeEmpresa(nome);

      // Município de prestação: o configurado; se não houver, o do CEP da empresa (mesmo
      // código IBGE que a NF-e já resolve pelo CEP).
      if (settings?.nfse_codigo_municipio) {
        setMunicipioPrestacao(settings.nfse_codigo_municipio);
      } else if (onlyDigits(companyRes?.data?.address_cep).length === 8) {
        const r = await lookupCep(companyRes.data.address_cep);
        if (ativo && r?.ibge) setMunicipioPrestacao((atual) => atual || r.ibge);
      }

      // Serviço padrão: o que a empresa salvou > sugestão pelo CNAE > pelo nome da empresa.
      let salvo: any = null;
      try { salvo = padraoRes?.data?.value ? JSON.parse(padraoRes.data.value) : null; } catch { salvo = null; }
      if (salvo?.c_trib_nac) {
        setPadraoSalvo(salvo);
        setCTribNac((atual) => atual || String(salvo.c_trib_nac));
        if (salvo.nbs) setNbs((atual) => atual || String(salvo.nbs));
        if (salvo.discriminacao) setDiscriminacao((atual) => atual || String(salvo.discriminacao));
        if (Number(salvo.aliquota) > 0) setAliquota((atual) => atual || Number(salvo.aliquota));
        setOrigemPadrao('o padrão salvo da empresa');
      } else {
        const sug = sugerirServicoPadrao({ cnae: cnaeEmpresa?.codigo, nomeEmpresa: nome });
        if (sug) {
          setCTribNac((atual) => atual || sug.cTribNac);
          setDiscriminacao((atual) => atual || sug.discriminacao);
          setOrigemPadrao(`o segmento da empresa (${sug.rotulo})`);
        }
      }
    })();
    return () => { ativo = false; };
  }, [company?.id]);

  // Busca de cliente cadastrado (nome, CPF/CNPJ ou telefone) — mesmo cadastro da NF-e.
  useEffect(() => {
    if (!company?.id || clienteBusca.trim().length < 2) { setClienteResultados([]); return; }
    const t = setTimeout(async () => {
      const q = clienteBusca.trim().replace(/[%,()]/g, '');
      const digits = q.replace(/\D/g, '');
      const filtros = [`name.ilike.%${q}%`];
      if (digits.length >= 3) filtros.push(`cpf.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
      const { data } = await supabase.from('customers').select('*').eq('company_id', company.id).or(filtros.join(',')).limit(10);
      setClienteResultados(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [clienteBusca, company?.id]);

  function selecionarCliente(c: any) {
    cepIdentity.current += 1;
    const doc = onlyDigits(c.cpf);
    setDestDoc(formatCpfCnpj(doc));
    setDestNome(c.name || '');
    setDestEmail(c.email || '');
    setDestLogradouro(c.address || '');
    setDestNumero(c.number || '');
    setDestComplemento(c.complement || '');
    setDestBairro(c.neighborhood || '');
    setDestCep(formatCep(c.cep));
    setDestMunicipioIbge(onlyDigits(c.ibge_code));
    setDestCidade(c.city || '');
    setDestUF((c.state || 'RS').toUpperCase());
    if (!doc) toast.warning('Este cliente não tem CPF/CNPJ no cadastro. Informe o documento para emitir.');
    setClienteBusca('');
    setClienteResultados([]);
  }

  // Resolve o código IBGE pelo CEP quando o cliente não tem (ou o CEP foi digitado).
  useEffect(() => {
    if (onlyDigits(destCep).length !== 8 || /^\d{7}$/.test(destMunicipioIbge)) return;
    let ativo = true;
    const identidade = cepIdentity.current;
    lookupCep(destCep).then((r) => {
      if (!ativo || identidade !== cepIdentity.current || !r) return;
      setDestMunicipioIbge(r.ibge);
      setDestCidade(r.cidade);
      setDestUF(r.uf);
      setDestLogradouro((atual) => atual || r.logradouro);
      setDestBairro((atual) => atual || r.bairro);
    });
    return () => { ativo = false; };
  }, [destCep, destMunicipioIbge]);

  // Atalhos de código de serviço: padrão do segmento + os do CNAE (não substituem a busca livre).
  const sugeridos = useMemo(() => {
    const seg = sugerirServicoPadrao({ cnae: cnae?.codigo, nomeEmpresa });
    const codigos = new Set<string>();
    if (padraoSalvo?.c_trib_nac) codigos.add(String(padraoSalvo.c_trib_nac));
    if (seg) { codigos.add(seg.cTribNac); seg.alternativos.forEach((c) => codigos.add(c)); }
    (NFSE_CTRIBNAC_POR_CNAE[cnae?.codigo || ''] || []).forEach((c) => codigos.add(c));
    return [...codigos]
      .map((cod) => ({ codigo: cod, descricao: NFSE_CTRIBNAC.find(([c]) => c === cod)?.[1] || '' }))
      .filter((s) => s.descricao);
  }, [cnae, nomeEmpresa, padraoSalvo]);

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

  // Só erros reais bloqueiam; avisos (ex.: homologação) não entram aqui.
  const erros = [...problemasCadastro, ...problemas].filter((p) => p.nivel === 'erro');
  const temErro = erros.length > 0;
  const msgPorCampo = (campo: string) => erros.find((p) => p.campo === campo)?.mensagem;

  // Mensagens curtas para o tomador (o texto de validarNfse junta documento e nome).
  const docDigits = onlyDigits(destDoc);
  const erroDoc = !docDigits
    ? 'Informe o CPF ou CNPJ.'
    : (docDigits.length === 11 ? !cpfValido(docDigits) : docDigits.length === 14 ? !cnpjValido(docDigits) : true)
      ? 'CPF/CNPJ inválido.'
      : undefined;
  const erroNome = !destNome.trim() ? 'Informe o nome ou razão social.' : undefined;

  // Pendências do cadastro da empresa (token, regime): não dá para corrigir nesta tela,
  // então ficam numa linha discreta no cabeçalho em vez de um bloco vermelho no topo.
  const pendenciasEmpresa = erros.filter((p) => p.campo === 'token' || p.campo === 'regime');

  function focarPrimeiroErro() {
    const ordem: Array<[boolean, string]> = [
      [!!msgPorCampo('municipio'), 'nfse-municipio'],
      [!!erroDoc, 'nfse-doc'],
      [!!erroNome, 'nfse-nome'],
      [!!msgPorCampo('descricao'), 'nfse-descricao'],
      [!!msgPorCampo('codigo'), 'nfse-codigo'],
      [!!msgPorCampo('nbs'), 'nfse-nbs'],
      [!!msgPorCampo('valor'), 'nfse-valor'],
    ];
    const alvo = ordem.find(([tem]) => tem)?.[1];
    if (!alvo) return;
    const el = document.getElementById(alvo);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    (el as HTMLElement | null)?.focus?.();
  }

  async function salvarPadrao() {
    if (!company?.id || cTribNac.replace(/\D/g, '').length !== 6) return;
    setSalvandoPadrao(true);
    try {
      const valor = { c_trib_nac: cTribNac, nbs: nbs || '', discriminacao: discriminacao.trim(), aliquota: aliquota > 0 ? aliquota : 0 };
      const { error } = await supabase.from('store_settings').upsert(
        { company_id: company.id, key: NOME_TIPO_PADRAO_KEY, value: JSON.stringify(valor) },
        { onConflict: 'company_id,key' },
      );
      if (error) throw error;
      setPadraoSalvo(valor);
      setOrigemPadrao('o padrão salvo da empresa');
      toast.success('Serviço salvo como padrão desta empresa.');
    } catch (e) {
      console.error(e);
      toast.error('Não foi possível salvar o padrão.');
    } finally {
      setSalvandoPadrao(false);
    }
  }

  async function emitir() {
    if (temErro) {
      setTentou(true);
      if (pendenciasEmpresa.length > 0 && erros.length === pendenciasEmpresa.length) {
        toast.error(pendenciasEmpresa[0].mensagem);
      } else {
        // Espera o React pintar os erros nos campos antes de rolar até o primeiro.
        setTimeout(focarPrimeiroErro, 0);
      }
      return;
    }
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
            complemento: destComplemento || undefined,
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

  const erroMunicipio = mostrar('municipio') ? msgPorCampo('municipio') : undefined;
  const erroDocVisivel = mostrar('doc') ? erroDoc : undefined;
  const erroNomeVisivel = mostrar('nome') ? erroNome : undefined;
  const erroDescricao = mostrar('descricao') ? msgPorCampo('descricao') : undefined;
  const erroCodigo = mostrar('codigo') ? msgPorCampo('codigo') : undefined;
  const erroNbs = mostrar('nbs') ? msgPorCampo('nbs') : undefined;
  const erroValor = mostrar('valor') ? msgPorCampo('valor') : undefined;

  return (
    <AppLayout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Nova NFS-e</h1>
          <p className="text-sm text-muted-foreground">Emissão de Nota Fiscal de Serviço Eletrônica (padrão nacional).</p>
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
              {ambiente === 'homologacao' && <p className="mt-1 text-xs text-muted-foreground">Homologação: sem validade fiscal.</p>}
            </div>
            <div className="md:col-span-2">
              <Label>Município de prestação (IBGE) *</Label>
              <Input
                id="nfse-municipio"
                className={invalido(erroMunicipio)}
                value={municipioPrestacao}
                onChange={e => setMunicipioPrestacao(e.target.value.replace(/\D/g, ''))}
                onBlur={() => toca('municipio')}
                maxLength={7}
                placeholder="7 dígitos"
              />
              <ErroCampo msg={erroMunicipio} />
            </div>
            {pendenciasEmpresa.length > 0 && (
              <div className="md:col-span-4 space-y-0.5">
                {pendenciasEmpresa.map((p, i) => <p key={i} className="text-xs text-destructive">{p.mensagem}</p>)}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Tomador */}
        <Card>
          <CardHeader><CardTitle className="text-base">Tomador</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input className="pl-9" placeholder="Buscar cliente cadastrado por nome, CPF/CNPJ ou telefone…" value={clienteBusca} onChange={e => setClienteBusca(e.target.value)} />
              {clienteResultados.length > 0 && (
                <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                  {clienteResultados.map((c) => (
                    <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm" onClick={() => selecionarCliente(c)}>
                      <span className="font-medium">{c.name}</span>
                      <span className="text-muted-foreground ml-2">{c.cpf ? formatCpfCnpj(c.cpf) : c.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <Label>CPF/CNPJ *</Label>
                <Input id="nfse-doc" className={invalido(erroDocVisivel)} value={destDoc} onChange={e => setDestDoc(formatCpfCnpj(e.target.value))} onBlur={() => toca('doc')} />
                <ErroCampo msg={erroDocVisivel} />
              </div>
              <div className="md:col-span-2">
                <Label>Nome / Razão social *</Label>
                <Input id="nfse-nome" className={invalido(erroNomeVisivel)} value={destNome} onChange={e => setDestNome(e.target.value)} onBlur={() => toca('nome')} />
                <ErroCampo msg={erroNomeVisivel} />
              </div>
              <div><Label>Inscrição Municipal</Label><Input value={destIM} onChange={e => setDestIM(e.target.value)} /></div>
              <div className="md:col-span-2"><Label>E-mail</Label><Input value={destEmail} onChange={e => setDestEmail(e.target.value)} /></div>
              <div>
                <Label>CEP</Label>
                <Input
                  value={destCep}
                  onChange={e => { cepIdentity.current += 1; setDestMunicipioIbge(''); setDestCep(formatCep(e.target.value)); }}
                />
              </div>
              <div><Label>Número</Label><Input value={destNumero} onChange={e => setDestNumero(e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Logradouro</Label><Input value={destLogradouro} onChange={e => setDestLogradouro(e.target.value)} /></div>
              <div><Label>Complemento</Label><Input value={destComplemento} onChange={e => setDestComplemento(e.target.value)} /></div>
              <div><Label>Bairro</Label><Input value={destBairro} onChange={e => setDestBairro(e.target.value)} /></div>
              <div className="md:col-span-2"><Label>Município</Label><Input value={destCidade} onChange={e => setDestCidade(e.target.value)} /></div>
              <div><Label>UF</Label><Input value={destUF} maxLength={2} onChange={e => setDestUF(e.target.value.toUpperCase())} /></div>
              <div>
                <Label>Município (IBGE)</Label>
                <Input value={destMunicipioIbge} onChange={e => setDestMunicipioIbge(e.target.value.replace(/\D/g, ''))} maxLength={7} placeholder="vem do CEP" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Serviço */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Serviço</CardTitle>
            <Button type="button" variant="ghost" size="sm" onClick={salvarPadrao} disabled={salvandoPadrao || cTribNac.replace(/\D/g, '').length !== 6}>
              {salvandoPadrao && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}
              Salvar como padrão da empresa
            </Button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {origemPadrao && (
              <p className="md:col-span-4 text-xs text-muted-foreground">Pré-preenchido com {origemPadrao}. Pode alterar.</p>
            )}
            <div className="md:col-span-4">
              <Label>Descrição do serviço * (mín. 10 caracteres)</Label>
              <Input id="nfse-descricao" className={invalido(erroDescricao)} value={discriminacao} onChange={e => setDiscriminacao(e.target.value)} onBlur={() => toca('descricao')} />
              <ErroCampo msg={erroDescricao} />
            </div>
            <div className="md:col-span-2 relative">
              <Label>Código de Tributação Nacional *</Label>
              {sugeridos.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1.5">
                  <span className="text-xs text-muted-foreground self-center mr-1">Sugeridos para esta empresa:</span>
                  {sugeridos.map((s) => (
                    <button
                      key={s.codigo}
                      type="button"
                      className={`text-xs border rounded-full px-2 py-0.5 hover:bg-muted/60 ${cTribNac === s.codigo ? 'bg-muted font-medium' : ''}`}
                      onClick={() => { setCTribNac(s.codigo); setCTribNacBusca(''); setNbs(''); }}
                      title={s.descricao}
                    >
                      {s.codigo} — {s.descricao.length > 40 ? `${s.descricao.slice(0, 40)}…` : s.descricao}
                    </button>
                  ))}
                </div>
              )}
              <Input
                id="nfse-codigo"
                className={invalido(erroCodigo)}
                placeholder="Buscar por código ou descrição…"
                value={cTribNac ? `${cTribNac} — ${NFSE_CTRIBNAC.find(([c]) => c === cTribNac)?.[1] || ''}` : cTribNacBusca}
                onChange={e => { setCTribNac(''); setCTribNacBusca(e.target.value); }}
                onBlur={() => toca('codigo')}
              />
              <ErroCampo msg={erroCodigo} />
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
                <SelectTrigger id="nfse-nbs" className={invalido(erroNbs)}><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Nenhum</SelectItem>
                  {nbsSugeridos.map((n) => (
                    <SelectItem key={n.codigo} value={n.codigo}>{n.codigo} — {n.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <ErroCampo msg={erroNbs} />
            </div>
            <div><Label>Cód. Trib. Municipal (opcional)</Label><Input value={cTribMun} onChange={e => setCTribMun(e.target.value)} /></div>
          </CardContent>
        </Card>

        {/* Valores */}
        <Card>
          <CardHeader><CardTitle className="text-base">Valores</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div id="nfse-valor-wrap" onBlur={() => toca('valor')}>
              <Label>Valor do serviço *</Label>
              <div id="nfse-valor" tabIndex={-1} className="outline-none">
                <CurrencyInput value={valorServico} onValueChange={setValorServico} />
              </div>
              <ErroCampo msg={erroValor} />
            </div>
            <div><Label>Desconto</Label><CurrencyInput value={desconto} onValueChange={setDesconto} /></div>
            <div><Label>Deduções da base de cálculo</Label><CurrencyInput value={deducoes} onValueChange={setDeducoes} /></div>
            <div>
              <Label>Alíquota ISS (%)</Label>
              <Input type="number" step="0.01" value={aliquota} onChange={e => setAliquota(Number(e.target.value))} />
              <p className="mt-1 text-xs text-muted-foreground">Simples Nacional: normalmente 0 (o ISS vai no DAS).</p>
            </div>
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
          <Button onClick={emitir} disabled={loading}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Emitir NFS-e
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
