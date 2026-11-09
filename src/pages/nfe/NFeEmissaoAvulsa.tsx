import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2, Search, ScanBarcode, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { CurrencyInput } from '@/components/ui/currency-input';
import {
  NFE_FREIGHT_MODES, NFE_PAYMENT_TYPES, NFE_PRESENCE, NFE_TEXT_LIMITS,
  buildInstallments, changeAllowed, paymentDifferenceCents, validAccessKey, validTaxDocument,
  type NFeInstallment, type NFePayment,
} from '@/lib/nfeForm';
import { IND_IE_OPTIONS, formatCep, lookupCep, onlyDigits } from '@/lib/fiscalPerson';
import { DanfePreviewDialog } from '@/components/nfe/DanfePreviewDialog';

type Item = {
  product_id: string | null;
  descricao: string;
  ncm: string;
  cfop: string;
  cest?: string;
  gtin?: string;
  unidade: string;
  quantidade: number;
  valor_unitario: number;
  csosn?: string;
  icms_origin?: string;
  icms_aliquot?: number;
  cst_pis?: string;
  cst_cofins?: string;
  aliquota_pis?: number;
  aliquota_cofins?: number;
  ipi_cst?: string;
  ipi_aliquot?: number;
};

const TABS = ['geral', 'pagamentos', 'transporte', 'adicionais'] as const;
type Tab = typeof TABS[number];
const NATUREZAS = ['Venda de mercadoria', 'Devolução de mercadoria', 'Remessa', 'Transferência'];
const money = (n: number) => `R$ ${(Number(n) || 0).toFixed(2).replace('.', ',')}`;
const nowLocal = () => {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

export default function NFeEmissaoAvulsa() {
  const { company, user } = useAuthContext() as any;
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>('geral');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(params.get('rascunho'));
  const transmitting = useRef(false);

  // Cabeçalho
  const [serie, setSerie] = useState('1');
  const [ambiente, setAmbiente] = useState<'homologacao' | 'producao'>('homologacao');
  const [naturezaOperacao, setNaturezaOperacao] = useState('Venda');
  const [finalidade, setFinalidade] = useState<number>(1);
  const [dhEmi, setDhEmi] = useState(nowLocal());
  const [dhSaiEnt, setDhSaiEnt] = useState(nowLocal());
  const [indPres, setIndPres] = useState('1');
  const [indFinal, setIndFinal] = useState(true);

  // Destinatário
  const [destTipo, setDestTipo] = useState<'pj' | 'pf'>('pj');
  const [destCnpj, setDestCnpj] = useState('');
  const [destCpf, setDestCpf] = useState('');
  const [destRazao, setDestRazao] = useState('');
  const [destIE, setDestIE] = useState('');
  const [destLogradouro, setDestLogradouro] = useState('');
  const [destNumero, setDestNumero] = useState('');
  const [destBairro, setDestBairro] = useState('');
  const [destCidade, setDestCidade] = useState('');
  const [destUF, setDestUF] = useState('RS');
  const [destCep, setDestCep] = useState('');
  const [destFone, setDestFone] = useState('');
  const [destComplemento, setDestComplemento] = useState('');
  const [destIbge, setDestIbge] = useState('');
  const [destIndIE, setDestIndIE] = useState('9');
  const [productFocused, setProductFocused] = useState(false);
  const [carrierResults, setCarrierResults] = useState<any[]>([]);
  const [carrierFocused, setCarrierFocused] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [savingCustomer, setSavingCustomer] = useState(false);

  // Itens
  const [items, setItems] = useState<Item[]>([]);
  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [barcode, setBarcode] = useState('');

  // Pagamentos
  const [payments, setPayments] = useState<NFePayment[]>([{ tipo: '17', valor: 0 }]);
  const [troco, setTroco] = useState(0);
  const [terms, setTerms] = useState('');
  const [installments, setInstallments] = useState<NFeInstallment[]>([]);

  // Transporte
  const [modFrete, setModFrete] = useState('9');
  const [valorFrete, setValorFrete] = useState(0);
  const [transp, setTransp] = useState({ documento: '', razao_social: '', ie: '', endereco: '', municipio: '', uf: '' });
  const [veiculo, setVeiculo] = useState({ placa: '', uf: '', rntc: '' });
  const [vol, setVol] = useState({ quantidade: '', especie: '', marca: '', numeracao: '', peso_liquido: '', peso_bruto: '' });

  // Adicionais
  const [xPed, setXPed] = useState('');
  const [infCpl, setInfCpl] = useState('');
  const [infAdFisco, setInfAdFisco] = useState('');
  const [autXml, setAutXml] = useState<string[]>([]);
  const [autXmlInput, setAutXmlInput] = useState('');
  const [refs, setRefs] = useState<string[]>([]);
  const [refInput, setRefInput] = useState('');

  useEffect(() => {
    if (!company?.id || draftId) return;
    supabase.from('pdv_settings').select('*').eq('company_id', company.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        const d = data as any;
        if (d.nfe_serie) setSerie(d.nfe_serie);
        if (d.nfe_ambiente) setAmbiente(d.nfe_ambiente);
        if (d.nfe_natureza_operacao) setNaturezaOperacao(d.nfe_natureza_operacao);
        if (d.nfe_finalidade) setFinalidade(d.nfe_finalidade);
      });
  }, [company?.id, draftId]);

  // Reabrir rascunho
  useEffect(() => {
    if (!company?.id || !draftId) return;
    supabase.from('nfe_records').select('request_payload, status').eq('id', draftId).eq('company_id', company.id).maybeSingle()
      .then(({ data }) => {
        const f = (data as any)?.request_payload?.form;
        if (!f || (data as any).status !== 'rascunho') { toast.error('Rascunho não encontrado.'); setDraftId(null); return; }
        setSerie(f.serie); setAmbiente(f.ambiente); setNaturezaOperacao(f.naturezaOperacao); setFinalidade(f.finalidade);
        setDhEmi(f.dhEmi); setDhSaiEnt(f.dhSaiEnt); setIndPres(f.indPres); setIndFinal(f.indFinal);
        const d = f.dest || {};
        setDestTipo(d.tipo); setDestCnpj(d.cnpj); setDestCpf(d.cpf); setDestRazao(d.razao); setDestIE(d.ie);
        setDestLogradouro(d.logradouro); setDestNumero(d.numero); setDestBairro(d.bairro); setDestCidade(d.cidade);
        setDestUF(d.uf); setDestCep(d.cep); setDestFone(d.fone);
        setDestComplemento(d.complemento || ''); setDestIbge(d.ibge || ''); setDestIndIE(d.indIE || (d.ie ? '1' : '9'));
        setItems(f.items || []); setPayments(f.payments || []); setTroco(f.troco || 0); setTerms(f.terms || '');
        setInstallments(f.installments || []); setModFrete(f.modFrete); setValorFrete(f.valorFrete || 0);
        setTransp(f.transp); setVeiculo(f.veiculo); setVol(f.vol);
        setXPed(f.xPed || ''); setInfCpl(f.infCpl || ''); setInfAdFisco(f.infAdFisco || '');
        setAutXml(f.autXml || []); setRefs(f.refs || []);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  // Lista produtos ao focar o campo (mesmo vazio); a digitação filtra.
  useEffect(() => {
    if (!company?.id || !productFocused) { setProductResults([]); return; }
    const t = setTimeout(async () => {
      const q = productSearch.trim().replace(/[%,()]/g, '');
      let query = supabase
        .from('products')
        .select('id, name, code, gtin, ncm, cfop, cest, icms_origin, tax_rule_id, sale_price, unit')
        .eq('company_id', company.id)
        .eq('active', true)
        .order('name')
        .limit(q ? 20 : 30);
      if (q) query = query.or(`name.ilike.%${q}%,code.ilike.%${q}%,gtin.ilike.%${q}%`);
      const { data, error } = await query;
      if (error) console.error('[NFe] busca de produto falhou:', error);
      setProductResults((data as any) || []);
    }, productSearch.trim() ? 200 : 0);
    return () => clearTimeout(t);
  }, [productSearch, productFocused, company?.id]);

  // Transportadores cadastrados (autocomplete na aba Transporte)
  useEffect(() => {
    if (!company?.id || !carrierFocused) { setCarrierResults([]); return; }
    const t = setTimeout(async () => {
      const q = transp.razao_social.trim().replace(/[%,()]/g, '');
      const d = transp.documento.replace(/\D/g, '');
      let query = (supabase as any).from('carriers').select('*').eq('company_id', company.id).eq('active', true).order('name').limit(15);
      if (d.length >= 3) query = query.ilike('document', `%${d}%`);
      else if (q) query = query.ilike('name', `%${q}%`);
      const { data } = await query;
      setCarrierResults(data || []);
    }, 200);
    return () => clearTimeout(t);
  }, [transp.razao_social, transp.documento, carrierFocused, company?.id]);

  function selectCarrier(c: any) {
    setTransp({
      documento: (c.document || '').replace(/\D/g, ''), razao_social: c.name || '', ie: c.state_registration || '',
      endereco: [c.address, c.number, c.neighborhood].filter(Boolean).join(', '), municipio: c.city || '', uf: c.state || '',
    });
    if (c.vehicle_plate) setVeiculo({ placa: c.vehicle_plate, uf: c.vehicle_state || '', rntc: c.rntc || '' });
    setCarrierFocused(false); setCarrierResults([]);
  }

  // Grava/atualiza automaticamente a transportadora preenchida em Transportadores.
  async function persistCarrier() {
    if (!company?.id || modFrete === '9' || !transp.razao_social.trim()) return;
    const doc = transp.documento.replace(/\D/g, '');
    const row: any = {
      company_id: company.id, name: transp.razao_social.trim(), document: doc || null,
      state_registration: transp.ie || null, address: transp.endereco || null, city: transp.municipio || null,
      state: transp.uf || null, vehicle_plate: veiculo.placa || null, vehicle_state: veiculo.uf || null, rntc: veiculo.rntc || null,
    };
    try {
      let q = (supabase as any).from('carriers').select('id').eq('company_id', company.id).limit(1);
      q = doc ? q.eq('document', doc) : q.ilike('name', transp.razao_social.trim());
      const { data } = await q;
      const existing = data?.[0];
      if (existing) await (supabase as any).from('carriers').update(row).eq('id', existing.id);
      else await (supabase as any).from('carriers').insert(row);
    } catch (e) { console.warn('[NFe] não foi possível salvar transportador', e); }
  }

  useEffect(() => {
    if (!company?.id || customerSearch.trim().length < 2) { setCustomerResults([]); return; }
    const t = setTimeout(async () => {
      const q = customerSearch.trim().replace(/[%,()]/g, '');
      const digits = q.replace(/\D/g, '');
      const filters = [`name.ilike.%${q}%`];
      if (digits.length >= 3) filters.push(`cpf.ilike.%${digits}%`, `phone.ilike.%${digits}%`);
      const { data } = await supabase.from('customers')
        .select('*')
        .eq('company_id', company.id).or(filters.join(',')).limit(10);
      setCustomerResults(data || []);
    }, 250);
    return () => clearTimeout(t);
  }, [customerSearch, company?.id]);

  function selectCustomer(c: any) {
    const doc = (c.cpf || '').replace(/\D/g, '');
    const isPJ = doc.length === 14 || c.person_type === 'PJ';
    if (isPJ) { setDestTipo('pj'); setDestCnpj(doc); setDestCpf(''); } else { setDestTipo('pf'); setDestCpf(doc); setDestCnpj(''); }
    setDestRazao(c.name || ''); setDestFone(c.phone || '');
    setDestIndIE(c.ind_ie_dest || (c.ie && c.ie !== 'ISENTO' ? '1' : '9'));
    setDestIE(c.ie || '');
    setDestLogradouro(c.address || ''); setDestNumero(c.number || ''); setDestBairro(c.neighborhood || '');
    setDestComplemento(c.complement || ''); setDestCep(c.cep || ''); setDestIbge(c.ibge_code || '');
    setDestCidade(c.city || ''); setDestUF((c.state || destUF).toUpperCase());
    if (!doc) toast.warning('Este cliente não tem CPF/CNPJ no cadastro.');
    setCustomerSearch(''); setCustomerResults([]);
  }

  async function quickSaveCustomer() {
    if (!company?.id) return;
    const phone = destFone.replace(/\D/g, '');
    if (!destRazao.trim() || phone.length < 10) { toast.error('Informe nome e telefone do destinatário para cadastrar.'); return; }
    setSavingCustomer(true);
    const { error } = await supabase.from('customers').upsert({
      company_id: company.id, phone, name: destRazao.trim(),
      cpf: (destTipo === 'pj' ? destCnpj : destCpf).replace(/\D/g, '') || null,
      address: destLogradouro || null, number: destNumero || null, neighborhood: destBairro || null,
      city: destCidade || null, state: destUF || null,
      complement: destComplemento || null, cep: destCep || null, ibge_code: destIbge || null,
      person_type: destTipo === 'pj' ? 'PJ' : 'PF', ie: destIE || null, ind_ie_dest: destIndIE,
    } as any, { onConflict: 'company_id,phone' });
    setSavingCustomer(false);
    if (error) toast.error('Não foi possível cadastrar o cliente.'); else toast.success('Cliente cadastrado.');
  }

  async function fetchTaxRule(taxRuleId?: string | null) {
    if (!taxRuleId) return null;
    const { data, error } = await supabase
      .from('tax_rules')
      .select('cfop, ncm, cest, csosn, icms_aliquot, pis_cst, pis_aliquot, cofins_cst, cofins_aliquot, ipi_cst, ipi_aliquot')
      .eq('id', taxRuleId).maybeSingle();
    if (error) console.error('[NFe] busca de regra tributária falhou:', error);
    return data;
  }

  async function addProduct(p: any) {
    const taxRule = await fetchTaxRule(p.tax_rule_id);
    setItems(prev => [...prev, {
      product_id: p.id,
      descricao: p.name,
      ncm: p.ncm || taxRule?.ncm || '00000000',
      cfop: taxRule?.cfop || p.cfop || '5102',
      cest: p.cest || taxRule?.cest || undefined,
      gtin: p.gtin || undefined,
      unidade: p.unit || 'UN',
      quantidade: 1,
      valor_unitario: Number(p.sale_price) || 0,
      csosn: taxRule?.csosn || '102',
      icms_origin: p.icms_origin || '0',
      icms_aliquot: Number(taxRule?.icms_aliquot) || 0,
      cst_pis: taxRule?.pis_cst || '49',
      cst_cofins: taxRule?.cofins_cst || '49',
      aliquota_pis: Number(taxRule?.pis_aliquot) || 0,
      aliquota_cofins: Number(taxRule?.cofins_aliquot) || 0,
      ipi_cst: taxRule?.ipi_cst || '99',
      ipi_aliquot: Number(taxRule?.ipi_aliquot) || 0,
    }]);
    setProductSearch(''); setProductResults([]);
  }

  async function addByBarcode() {
    const code = barcode.trim();
    if (!code || !company?.id) return;
    const { data } = await supabase.from('products')
      .select('id, name, code, gtin, ncm, cfop, cest, icms_origin, tax_rule_id, sale_price, unit')
      .eq('company_id', company.id).or(`gtin.eq.${code.replace(/[,()]/g, '')},code.eq.${code.replace(/[,()]/g, '')}`)
      .limit(1).maybeSingle();
    if (!data) { toast.error('Produto não encontrado para este código.'); return; }
    await addProduct(data);
    setBarcode('');
  }

  function addManualItem() {
    setItems(prev => [...prev, {
      product_id: null, descricao: '', ncm: '', cfop: '5102', unidade: 'UN', quantidade: 1, valor_unitario: 0,
      csosn: '102', icms_origin: '0', icms_aliquot: 0, cst_pis: '49', cst_cofins: '49',
      aliquota_pis: 0, aliquota_cofins: 0, ipi_cst: '99', ipi_aliquot: 0,
    }]);
  }
  const updateItem = (idx: number, patch: Partial<Item>) =>
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const valorProdutos = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0),
    [items],
  );
  const valorTotal = Math.round((valorProdutos + (modFrete === '9' ? 0 : valorFrete)) * 100) / 100;
  const diffCents = paymentDifferenceCents(valorTotal, payments, troco);

  function validate(): { tab: Tab; msg: string } | null {
    const g = (msg: string) => ({ tab: 'geral' as Tab, msg });
    if (destTipo === 'pj') {
      if (destCnpj.replace(/\D/g, '').length !== 14) return g('CNPJ do destinatário inválido.');
    } else if (destCpf.replace(/\D/g, '').length !== 11) return g('CPF do destinatário inválido.');
    if (!destRazao.trim()) return g(destTipo === 'pj' ? 'Razão social do destinatário é obrigatória.' : 'Nome do destinatário é obrigatório.');
    if (!destLogradouro.trim() || !destCidade.trim() || !destUF.trim()) return g('Endereço do destinatário incompleto.');
    if (destIndIE === '1' && !destIE.trim()) return g('Informe a inscrição estadual do destinatário contribuinte.');
    if (!naturezaOperacao.trim()) return g('Natureza da operação é obrigatória.');
    if (items.length === 0) return g('Adicione pelo menos 1 item.');
    for (const it of items) {
      if (!it.descricao.trim()) return g('Item sem descrição.');
      if (!it.ncm || it.ncm.length < 8) return g(`NCM inválido em "${it.descricao}".`);
      if (!it.cfop) return g(`CFOP obrigatório em "${it.descricao}".`);
      if (!it.quantidade || it.quantidade <= 0) return g(`Quantidade inválida em "${it.descricao}".`);
      if (!it.valor_unitario || it.valor_unitario <= 0) return g(`Valor unitário inválido em "${it.descricao}".`);
    }
    if (payments.length === 0) return { tab: 'pagamentos', msg: 'Informe ao menos uma forma de pagamento.' };
    if (troco > 0 && !changeAllowed(payments)) return { tab: 'pagamentos', msg: 'Troco só é permitido com pagamento em dinheiro.' };
    if (diffCents !== 0) return { tab: 'pagamentos', msg: `A soma dos pagamentos não fecha o total (${money(diffCents / 100)} de diferença).` };
    if (installments.length) {
      const sum = installments.reduce((s, p) => s + Math.round(p.valor * 100), 0);
      if (sum !== Math.round(valorTotal * 100)) return { tab: 'pagamentos', msg: 'A soma das parcelas não fecha o total.' };
    }
    if (modFrete !== '9' && transp.documento && !validTaxDocument(transp.documento))
      return { tab: 'transporte', msg: 'CPF/CNPJ da transportadora inválido.' };
    return null;
  }

  function buildPayload() {
    const hasTransport = modFrete !== '9';
    return {
      serie, ambiente, natureza_operacao: naturezaOperacao, finalidade,
      data_emissao: dhEmi, data_saida_entrada: dhSaiEnt,
      indicador_presenca: indPres, consumidor_final: indFinal ? 1 : 0,
      destinatario: {
        ...(destTipo === 'pj' ? { cnpj: destCnpj.replace(/\D/g, '') } : { cpf: destCpf.replace(/\D/g, '') }),
        razao_social: destRazao,
        inscricao_estadual: destIndIE === '1' ? (destIE || undefined) : undefined,
        telefone: destFone.replace(/\D/g, '') || undefined,
        endereco: {
          logradouro: destLogradouro, numero: destNumero, bairro: destBairro,
          complemento: destComplemento || undefined,
          municipio: destCidade, uf: destUF, cep: destCep.replace(/\D/g, ''),
          codigo_municipio: destIbge.replace(/\D/g, '') || undefined,
        },
        indIEDest: destIndIE,
      },
      itens: items,
      valor_frete: hasTransport ? valorFrete : 0,
      valor_total: valorTotal,
      pagamentos: payments.map(p => ({ tipo: p.tipo, valor: p.valor })),
      valor_troco: troco || 0,
      cobranca: installments.length ? { duplicatas: installments } : undefined,
      transporte: {
        modalidade_frete: modFrete,
        ...(hasTransport ? {
          transportadora: transp.documento || transp.razao_social ? { ...transp, documento: transp.documento.replace(/\D/g, '') } : undefined,
          veiculo: veiculo.placa ? veiculo : undefined,
          volumes: vol.quantidade ? [vol] : undefined,
        } : {}),
      },
      informacoes_adicionais: {
        numero_pedido: xPed || undefined,
        contribuinte: infCpl || undefined,
        fisco: infAdFisco || undefined,
      },
      autorizados_xml: autXml.length ? autXml : undefined,
      documentos_referenciados: refs.length ? refs : undefined,
    };
  }

  function formSnapshot() {
    return {
      serie, ambiente, naturezaOperacao, finalidade, dhEmi, dhSaiEnt, indPres, indFinal,
      dest: { tipo: destTipo, cnpj: destCnpj, cpf: destCpf, razao: destRazao, ie: destIE, logradouro: destLogradouro,
        numero: destNumero, bairro: destBairro, cidade: destCidade, uf: destUF, cep: destCep, fone: destFone,
        complemento: destComplemento, ibge: destIbge, indIE: destIndIE },
      items, payments, troco, terms, installments, modFrete, valorFrete, transp, veiculo, vol,
      xPed, infCpl, infAdFisco, autXml, refs,
    };
  }

  // Rascunho: nunca chama a SEFAZ, só grava localmente com status 'rascunho'.
  async function salvarRascunho(silent = false): Promise<boolean> {
    if (!company?.id) return false;
    setSaving(true);
    await persistCarrier();
    const row: any = {
      company_id: company.id, status: 'rascunho', serie, ambiente,
      natureza_operacao: naturezaOperacao, finalidade, valor_total: valorTotal,
      destinatario: { razao_social: destRazao, cnpj: destCnpj || undefined, cpf: destCpf || undefined },
      request_payload: { form: formSnapshot() },
    };
    const res = draftId
      ? await supabase.from('nfe_records').update(row).eq('id', draftId).eq('company_id', company.id).select('id').single()
      : await supabase.from('nfe_records').insert({ ...row, external_id: `rascunho-${crypto.randomUUID()}`, created_by: user?.id ?? null }).select('id').single();
    setSaving(false);
    if (res.error) { toast.error('Não foi possível salvar o rascunho.'); return false; }
    setDraftId(res.data.id);
    if (!silent) toast.success('Rascunho salvo. Nada foi enviado à SEFAZ.');
    return true;
  }

  async function transmitir() {
    if (transmitting.current) return;
    const err = validate();
    if (err) { setTab(err.tab); toast.error(err.msg); return; }
    if (!company?.id) return;
    if (!window.confirm(`Transmitir NF-e de ${money(valorTotal)} para a SEFAZ em ${ambiente === 'producao' ? 'PRODUÇÃO' : 'homologação'}?`)) return;
    transmitting.current = true;
    setLoading(true);
    await persistCarrier();
    try {
      const { data, error } = await supabase.functions.invoke('nfe-proxy', {
        body: { action: 'emitir', companyId: company.id, payload: buildPayload() },
      });
      if (error) throw error;
      if (draftId) {
        await supabase.from('nfe_records').update({ status: 'rascunho_transmitido' }).eq('id', draftId).eq('company_id', company.id);
      }
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
      transmitting.current = false;
      setLoading(false);
    }
  }

  const tabIdx = TABS.indexOf(tab);
  const counter = (v: string, max: number) => <span className="text-xs text-muted-foreground">{v.length}/{max}</span>;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-4 pb-28">
        <div>
          <h1 className="text-2xl font-bold">Nova NF-e {draftId && <span className="text-sm font-normal text-muted-foreground">(rascunho)</span>}</h1>
          <p className="text-sm text-muted-foreground">Emissão de Nota Fiscal Eletrônica (modelo 55).</p>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="geral">GERAL</TabsTrigger>
            <TabsTrigger value="pagamentos">PAGAMENTOS</TabsTrigger>
            <TabsTrigger value="transporte">TRANSPORTE</TabsTrigger>
            <TabsTrigger value="adicionais">ADICIONAIS</TabsTrigger>
          </TabsList>

          {/* GERAL */}
          <TabsContent value="geral" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Cabeçalho</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div><Label>Emissão</Label><Input type="datetime-local" value={dhEmi} onChange={e => setDhEmi(e.target.value)} /></div>
                <div><Label>Saída/Entrada</Label><Input type="datetime-local" value={dhSaiEnt} onChange={e => setDhSaiEnt(e.target.value)} /></div>
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
                  <Input list="nfe-naturezas" value={naturezaOperacao} onChange={e => setNaturezaOperacao(e.target.value)} />
                  <datalist id="nfe-naturezas">{NATUREZAS.map(n => <option key={n} value={n} />)}</datalist>
                </div>
                <div>
                  <Label>Finalidade</Label>
                  <Select value={String(finalidade)} onValueChange={(v) => setFinalidade(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Normal</SelectItem>
                      <SelectItem value="2">2 — Complementar</SelectItem>
                      <SelectItem value="3">3 — Ajuste</SelectItem>
                      <SelectItem value="4">4 — Devolução</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Presença do comprador</Label>
                  <Select value={indPres} onValueChange={setIndPres}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{NFE_PRESENCE.map(p => <SelectItem key={p.code} value={p.code}>{p.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm md:col-span-4">
                  <Checkbox checked={indFinal} onCheckedChange={(v) => setIndFinal(!!v)} /> Consumidor final
                </label>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base">Cliente / Destinatário</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={quickSaveCustomer} disabled={savingCustomer} title="Cadastrar como cliente">
                    <UserPlus className="w-4 h-4" />
                  </Button>
                  <Select value={destTipo} onValueChange={(v: any) => setDestTipo(v)}>
                    <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pj">Pessoa Jurídica</SelectItem>
                      <SelectItem value="pf">Pessoa Física</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input className="pl-9" placeholder="Buscar cliente por nome, CPF/CNPJ ou telefone…" value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} />
                  {customerResults.length > 0 && (
                    <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                      {customerResults.map(c => (
                        <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm" onClick={() => selectCustomer(c)}>
                          <span className="font-medium">{c.name}</span>
                          <span className="text-muted-foreground ml-2">{c.cpf || c.phone}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {destTipo === 'pj' ? (
                    <>
                      <div><Label>CNPJ *</Label><Input value={destCnpj} onChange={e => setDestCnpj(e.target.value)} /></div>
                      <div className="md:col-span-2"><Label>Razão social *</Label><Input value={destRazao} onChange={e => setDestRazao(e.target.value)} /></div>
                      <div />
                    </>
                  ) : (
                    <>
                      <div><Label>CPF *</Label><Input value={destCpf} onChange={e => setDestCpf(e.target.value)} /></div>
                      <div className="md:col-span-3"><Label>Nome *</Label><Input value={destRazao} onChange={e => setDestRazao(e.target.value)} /></div>
                    </>
                  )}
                  <div className="md:col-span-2">
                    <Label>Indicador de inscrição estadual</Label>
                    <Select value={destIndIE} onValueChange={setDestIndIE}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{IND_IE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="md:col-span-2"><Label>Inscrição Estadual{destIndIE === '1' ? ' *' : ''}</Label><Input value={destIE} disabled={destIndIE !== '1'} onChange={e => setDestIE(e.target.value)} /></div>
                  <div><Label>CEP</Label><Input value={destCep} onChange={async e => {
                    const v = formatCep(e.target.value); setDestCep(v);
                    if (onlyDigits(v).length === 8) {
                      const r = await lookupCep(v);
                      if (r) { if (r.logradouro) setDestLogradouro(r.logradouro); if (r.bairro) setDestBairro(r.bairro); setDestCidade(r.cidade); setDestUF(r.uf); setDestIbge(r.ibge); }
                    }
                  }} /></div>
                  <div className="md:col-span-2"><Label>Logradouro *</Label><Input value={destLogradouro} onChange={e => setDestLogradouro(e.target.value)} /></div>
                  <div><Label>Número</Label><Input value={destNumero} onChange={e => setDestNumero(e.target.value)} /></div>
                  <div><Label>Complemento</Label><Input value={destComplemento} onChange={e => setDestComplemento(e.target.value)} /></div>
                  <div><Label>Bairro</Label><Input value={destBairro} onChange={e => setDestBairro(e.target.value)} /></div>
                  <div><Label>Município *</Label><Input value={destCidade} onChange={e => setDestCidade(e.target.value)} /></div>
                  <div><Label>UF *</Label><Input value={destUF} maxLength={2} onChange={e => setDestUF(e.target.value.toUpperCase())} /></div>
                  <div><Label>Código IBGE</Label><Input value={destIbge} maxLength={7} onChange={e => setDestIbge(e.target.value)} /></div>
                  <div><Label>Telefone</Label><Input value={destFone} onChange={e => setDestFone(e.target.value)} /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Produtos</CardTitle>
                <Button variant="outline" size="sm" onClick={addManualItem}><Plus className="w-4 h-4 mr-1" /> Item manual</Button>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <div className="relative md:col-span-2">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Buscar produto pelo nome ou código…" value={productSearch} onChange={e => setProductSearch(e.target.value)}
                      onFocus={() => setProductFocused(true)} onBlur={() => setTimeout(() => setProductFocused(false), 200)} />
                    {productFocused && productResults.length === 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md px-3 py-2 text-sm text-muted-foreground">Nenhum produto encontrado.</div>
                    )}
                    {productResults.length > 0 && (
                      <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                        {productResults.map(p => (
                          <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm" onClick={() => addProduct(p)}>
                            <span className="font-medium">{p.name}</span>
                            {p.code && <span className="text-muted-foreground ml-2">#{p.code}</span>}
                            <span className="text-muted-foreground ml-2">{money(p.sale_price)}</span>
                            {!p.ncm && <span className="text-destructive ml-2 text-xs">sem NCM</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <ScanBarcode className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input className="pl-9" placeholder="Código de barras + Enter" value={barcode}
                      onChange={e => setBarcode(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addByBarcode(); } }} />
                  </div>
                </div>

                {items.length === 0 ? (
                  <div className="text-center text-muted-foreground py-6 text-sm">Nenhum item adicionado.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[1100px]">
                      <thead className="bg-muted/50">
                        <tr className="text-left">
                          <th className="px-2 py-1">Descrição</th>
                          <th className="px-2 py-1 w-24">NCM</th>
                          <th className="px-2 py-1 w-20">CFOP</th>
                          <th className="px-2 py-1 w-16">UN</th>
                          <th className="px-2 py-1 w-20">Qtd</th>
                          <th className="px-2 py-1 w-32">Vlr Unit.</th>
                          <th className="px-2 py-1 w-28">Total</th>
                          <th className="px-2 py-1 w-20">CSOSN</th>
                          <th className="px-2 py-1 w-16">Orig.</th>
                          <th className="px-2 py-1 w-20">% ICMS</th>
                          <th className="px-2 py-1 w-16">CST PIS</th>
                          <th className="px-2 py-1 w-16">CST COF.</th>
                          <th className="px-2 py-1 w-16">CST IPI</th>
                          <th className="px-2 py-1 w-16">% IPI</th>
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
                            <td className="px-2 py-1"><CurrencyInput value={it.valor_unitario} onValueChange={(v) => updateItem(idx, { valor_unitario: v })} /></td>
                            <td className="px-2 py-1 text-right font-medium">{money((it.quantidade || 0) * (it.valor_unitario || 0))}</td>
                            <td className="px-2 py-1"><Input value={it.csosn || ''} onChange={e => updateItem(idx, { csosn: e.target.value })} /></td>
                            <td className="px-2 py-1"><Input value={it.icms_origin || ''} onChange={e => updateItem(idx, { icms_origin: e.target.value })} /></td>
                            <td className="px-2 py-1"><Input type="number" value={it.icms_aliquot ?? 0} onChange={e => updateItem(idx, { icms_aliquot: Number(e.target.value) })} /></td>
                            <td className="px-2 py-1"><Input value={it.cst_pis || ''} onChange={e => updateItem(idx, { cst_pis: e.target.value })} /></td>
                            <td className="px-2 py-1"><Input value={it.cst_cofins || ''} onChange={e => updateItem(idx, { cst_cofins: e.target.value })} /></td>
                            <td className="px-2 py-1"><Input value={it.ipi_cst || ''} onChange={e => updateItem(idx, { ipi_cst: e.target.value })} /></td>
                            <td className="px-2 py-1"><Input type="number" value={it.ipi_aliquot ?? 0} onChange={e => updateItem(idx, { ipi_aliquot: Number(e.target.value) })} /></td>
                            <td className="px-2 py-1">
                              <Button variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* PAGAMENTOS */}
          <TabsContent value="pagamentos" className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Formas de pagamento</CardTitle>
                <Button variant="outline" size="sm" onClick={() => setPayments(p => [...p, { tipo: '01', valor: Math.max(0, diffCents / 100) }])}>
                  <Plus className="w-4 h-4 mr-1" /> Adicionar
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {payments.map((p, i) => (
                  <div key={i} className="grid grid-cols-[1fr_160px_40px] gap-2 items-center">
                    <Select value={p.tipo} onValueChange={(v) => setPayments(ps => ps.map((x, j) => j === i ? { ...x, tipo: v } : x))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{NFE_PAYMENT_TYPES.map(t => <SelectItem key={t.code} value={t.code}>{t.code} — {t.label}</SelectItem>)}</SelectContent>
                    </Select>
                    <CurrencyInput value={p.valor} onValueChange={(v) => setPayments(ps => ps.map((x, j) => j === i ? { ...x, valor: v } : x))} />
                    <Button variant="ghost" size="icon" onClick={() => setPayments(ps => ps.filter((_, j) => j !== i))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                  <div><Label>Troco</Label><CurrencyInput value={troco} onValueChange={setTroco} disabled={!changeAllowed(payments)} /></div>
                  <div className="md:col-span-2 flex flex-col justify-end text-sm">
                    <div>Total da nota: <strong>{money(valorTotal)}</strong></div>
                    <div className={diffCents === 0 ? 'text-primary' : 'text-destructive'}>
                      {diffCents === 0 ? '✓ Pagamentos conferem com o total' : `Diferença: ${money(diffCents / 100)}`}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Condição / Parcelamento</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1"><Label>Prazos em dias</Label><Input placeholder="Ex.: 30/60/90" value={terms} onChange={e => setTerms(e.target.value)} /></div>
                  <Button variant="outline" onClick={() => setInstallments(buildInstallments(valorTotal, terms, new Date()))}>Gerar parcelas</Button>
                  {installments.length > 0 && <Button variant="ghost" onClick={() => setInstallments([])}>Limpar</Button>}
                </div>
                {installments.map((p, i) => (
                  <div key={i} className="grid grid-cols-[60px_1fr_160px] gap-2 items-center text-sm">
                    <span className="font-mono">{p.numero}</span>
                    <Input type="date" value={p.vencimento} onChange={e => setInstallments(ps => ps.map((x, j) => j === i ? { ...x, vencimento: e.target.value } : x))} />
                    <CurrencyInput value={p.valor} onValueChange={(v) => setInstallments(ps => ps.map((x, j) => j === i ? { ...x, valor: v } : x))} />
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>

          {/* TRANSPORTE */}
          <TabsContent value="transporte" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Frete</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <Label>Modalidade do frete</Label>
                  <Select value={modFrete} onValueChange={setModFrete}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{NFE_FREIGHT_MODES.map(m => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Valor do frete</Label><CurrencyInput value={valorFrete} onValueChange={setValorFrete} disabled={modFrete === '9'} /></div>
              </CardContent>
            </Card>
            {modFrete !== '9' && (
              <>
                <Card>
                  <CardHeader><CardTitle className="text-base">Transportadora</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <div><Label>CNPJ/CPF</Label><Input value={transp.documento} onChange={e => setTransp({ ...transp, documento: e.target.value })}
                      onFocus={() => setCarrierFocused(true)} onBlur={() => setTimeout(() => setCarrierFocused(false), 200)} /></div>
                    <div className="md:col-span-2 relative"><Label>Razão social</Label>
                      <Input value={transp.razao_social} placeholder="Digite ou escolha um transportador cadastrado" onChange={e => setTransp({ ...transp, razao_social: e.target.value })}
                        onFocus={() => setCarrierFocused(true)} onBlur={() => setTimeout(() => setCarrierFocused(false), 200)} />
                      {carrierFocused && carrierResults.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-background border rounded-md shadow-md max-h-60 overflow-auto">
                          {carrierResults.map(c => (
                            <button key={c.id} type="button" className="w-full text-left px-3 py-2 hover:bg-muted/50 text-sm" onMouseDown={e => e.preventDefault()} onClick={() => selectCarrier(c)}>
                              <span className="font-medium">{c.name}</span>
                              <span className="text-muted-foreground ml-2">{c.document || ''} {c.city ? `· ${c.city}/${c.state || ''}` : ''}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div><Label>Inscrição Estadual</Label><Input value={transp.ie} onChange={e => setTransp({ ...transp, ie: e.target.value })} /></div>
                    <div className="md:col-span-2"><Label>Endereço</Label><Input value={transp.endereco} onChange={e => setTransp({ ...transp, endereco: e.target.value })} /></div>
                    <div><Label>Município</Label><Input value={transp.municipio} onChange={e => setTransp({ ...transp, municipio: e.target.value })} /></div>
                    <div><Label>UF</Label><Input maxLength={2} value={transp.uf} onChange={e => setTransp({ ...transp, uf: e.target.value.toUpperCase() })} /></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Veículo</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div><Label>Placa</Label><Input value={veiculo.placa} onChange={e => setVeiculo({ ...veiculo, placa: e.target.value.toUpperCase() })} /></div>
                    <div><Label>UF</Label><Input maxLength={2} value={veiculo.uf} onChange={e => setVeiculo({ ...veiculo, uf: e.target.value.toUpperCase() })} /></div>
                    <div><Label>RNTRC</Label><Input value={veiculo.rntc} onChange={e => setVeiculo({ ...veiculo, rntc: e.target.value })} /></div>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle className="text-base">Volumes</CardTitle></CardHeader>
                  <CardContent className="grid grid-cols-2 md:grid-cols-6 gap-3">
                    <div><Label>Quantidade</Label><Input type="number" value={vol.quantidade} onChange={e => setVol({ ...vol, quantidade: e.target.value })} /></div>
                    <div><Label>Espécie</Label><Input placeholder="Caixas" value={vol.especie} onChange={e => setVol({ ...vol, especie: e.target.value })} /></div>
                    <div><Label>Marca</Label><Input value={vol.marca} onChange={e => setVol({ ...vol, marca: e.target.value })} /></div>
                    <div><Label>Numeração</Label><Input value={vol.numeracao} onChange={e => setVol({ ...vol, numeracao: e.target.value })} /></div>
                    <div><Label>Peso líq. (kg)</Label><Input type="number" value={vol.peso_liquido} onChange={e => setVol({ ...vol, peso_liquido: e.target.value })} /></div>
                    <div><Label>Peso bruto (kg)</Label><Input type="number" value={vol.peso_bruto} onChange={e => setVol({ ...vol, peso_bruto: e.target.value })} /></div>
                  </CardContent>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ADICIONAIS */}
          <TabsContent value="adicionais" className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="text-base">Outras informações</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between"><Label>Número do pedido de compra</Label>{counter(xPed, NFE_TEXT_LIMITS.xPed)}</div>
                  <Input maxLength={NFE_TEXT_LIMITS.xPed} value={xPed} onChange={e => setXPed(e.target.value)} />
                </div>
                <div>
                  <div className="flex justify-between"><Label>Informações de interesse do contribuinte</Label>{counter(infCpl, NFE_TEXT_LIMITS.infCpl)}</div>
                  <Textarea rows={4} maxLength={NFE_TEXT_LIMITS.infCpl} value={infCpl} onChange={e => setInfCpl(e.target.value)} />
                </div>
                <div>
                  <div className="flex justify-between items-center">
                    <Label>Informações de interesse do fisco</Label>
                    <div className="flex items-center gap-2">
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setInfAdFisco(v => (v ? v + '\n' : '') + 'Documento emitido por ME ou EPP optante pelo Simples Nacional. Não gera direito a crédito fiscal de IPI.')}>
                        + Texto Simples Nacional
                      </Button>
                      {counter(infAdFisco, NFE_TEXT_LIMITS.infAdFisco)}
                    </div>
                  </div>
                  <Textarea rows={4} maxLength={NFE_TEXT_LIMITS.infAdFisco} value={infAdFisco} onChange={e => setInfAdFisco(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Autorizados a baixar o XML</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input placeholder="CPF ou CNPJ (ex.: contador)" value={autXmlInput} onChange={e => setAutXmlInput(e.target.value)} />
                  <Button variant="outline" onClick={() => {
                    const d = autXmlInput.replace(/\D/g, '');
                    if (!validTaxDocument(d)) { toast.error('CPF/CNPJ inválido.'); return; }
                    if (!autXml.includes(d)) setAutXml([...autXml, d]);
                    setAutXmlInput('');
                  }}>Adicionar</Button>
                </div>
                {autXml.map(d => (
                  <div key={d} className="flex justify-between items-center text-sm border rounded px-3 py-1">
                    <span className="font-mono">{d}</span>
                    <Button variant="ghost" size="icon" onClick={() => setAutXml(autXml.filter(x => x !== d))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="text-base">Documentos fiscais referenciados</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                <div className="flex gap-2">
                  <Input placeholder="Chave de acesso (44 dígitos)" value={refInput} onChange={e => setRefInput(e.target.value)} />
                  <Button variant="outline" onClick={() => {
                    const k = refInput.replace(/\D/g, '');
                    if (!validAccessKey(k)) { toast.error('A chave de acesso deve ter 44 dígitos.'); return; }
                    if (!refs.includes(k)) setRefs([...refs, k]);
                    setRefInput('');
                  }}>Adicionar</Button>
                </div>
                {refs.map(k => (
                  <div key={k} className="flex justify-between items-center text-sm border rounded px-3 py-1">
                    <span className="font-mono text-xs break-all">{k}</span>
                    <Button variant="ghost" size="icon" onClick={() => setRefs(refs.filter(x => x !== k))}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                  </div>
                ))}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t bg-background/95 backdrop-blur">
        <div className="max-w-6xl mx-auto px-4 py-3 flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => navigate('/nfe')}>Sair</Button>
          <span className="text-sm text-muted-foreground mr-auto ml-2">Total: <strong className="text-foreground">{money(valorTotal)}</strong></span>
          <Button variant="outline" disabled={tabIdx === 0} onClick={() => setTab(TABS[tabIdx - 1])}>Voltar</Button>
          <Button variant="secondary" onClick={() => salvarRascunho()} disabled={saving || loading}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)}>Pré-visualizar DANFE</Button>
          <Button onClick={transmitir} disabled={loading || saving}>
            {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Salvar e Transmitir
          </Button>
          <Button variant="outline" disabled={tabIdx === TABS.length - 1} onClick={() => setTab(TABS[tabIdx + 1])}>Próximo</Button>
        </div>
      </div>
      <DanfePreviewDialog open={previewOpen} onOpenChange={setPreviewOpen} company={company}
        data={{ payload: buildPayload(), valorProdutos, destTipo }} />
    </AppLayout>
  );
}
