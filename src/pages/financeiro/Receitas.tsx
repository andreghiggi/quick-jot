import { useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2, Check, MoreVertical, Receipt, ChevronDown, ChevronRight, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useAuthContext } from '@/contexts/AuthContext';
import { useFinanceiroEnabled } from '@/hooks/useFinanceiroEnabled';
import { useAccountsReceivable, type AccountReceivable } from '@/hooks/useAccountsReceivable';
import { usePaymentMethods } from '@/hooks/usePaymentMethods';
import { brl } from '@/components/pdv-v2/_format';
import {
  FinanceSearchBar, FinanceFilterPanel, FinanceActionMenu,
  FloatingFab, ConfirmDialog, BulkActionBar, Pagination, StatusBadge,
  computeUIStatus, applyFilters, emptyFilters,
  type FinanceRow, type FinanceFilters,
} from '@/components/financeiro/finance-shared';
import { FinanceModuleLayout } from '@/components/financeiro/FinanceModuleLayout';
import { NewFinanceEntryDialog } from '@/components/financeiro/NewFinanceEntryDialog';
import { EfetivarReceitaDialog } from '@/components/financeiro/EfetivarReceitaDialog';
import { RenegociarReceitaDialog } from '@/components/financeiro/RenegociarReceitaDialog';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { emitirNFCe, type NFCeItem } from '@/services/nfceService';
import { getNFCeRecordBySaleId, consultarNFCe, printDanfeFromRecord, printDanfeFromRecordViaIframe } from '@/services/nfceService';
import { buildNfceFiscalFields } from '@/utils/nfceItemFiscal';
import { printPaymentReceipt, printPaymentReceiptsConsolidated, type PaymentReceiptPayload } from '@/utils/paymentReceiptPrint';
import { useStoreSettings } from '@/hooks/useStoreSettings';
import { toast } from 'sonner';
import type { EfetivarPayment } from '@/components/financeiro/EfetivarReceitaDialog';

/** Item agregado da lista: pode ser uma venda com N parcelas OU um
 *  título avulso (sem pdv_sale_id). */
type GroupItem =
  | { kind: 'sale'; key: string; saleId: string; parcelas: AccountReceivable[] }
  | { kind: 'single'; key: string; row: AccountReceivable };

export default function Receitas() {
  const { user, company } = useAuthContext();
  const { enabled, loading: finLoading } = useFinanceiroEnabled(company?.id);
  const {
    items, loading, reload, create, receivePayment, receivePaymentSplit,
    remove, update, renegotiateSplit, renegotiateManySplit,
  } = useAccountsReceivable(company?.id);
  const { activePaymentMethods } = usePaymentMethods({ companyId: company?.id, channel: 'pdv' });
  const { settings: storeSettings } = useStoreSettings({ companyId: company?.id });

  const today = new Date().toISOString().slice(0, 10);

  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState<FinanceFilters>(emptyFilters);
  const [sortAsc, setSortAsc] = useState(true);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(10);

  // dialogs
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [menuTarget, setMenuTarget] = useState<FinanceRow | null>(null);
  const [editRow, setEditRow] = useState<AccountReceivable | null>(null);
  const [deleteRow, setDeleteRow] = useState<AccountReceivable | null>(null);
  const [bulkDelete, setBulkDelete] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  // Nova UX — agrupamento por venda
  const [installmentsGroup, setInstallmentsGroup] = useState<GroupItem | null>(null);
  const [detailsGroup, setDetailsGroup] = useState<GroupItem | null>(null);
  const [efetivarRow, setEfetivarRow] = useState<AccountReceivable | null>(null);
  /** Quando o operador seleciona várias parcelas no diálogo "Parcelas
   *  da venda" e clica em "Receber selecionadas", guardamos as parcelas
   *  aqui para efetivar tudo junto. */
  const [efetivarRows, setEfetivarRows] = useState<AccountReceivable[] | null>(null);
  /** Ids das parcelas marcadas dentro do diálogo "Parcelas da venda". */
  const [selectedInst, setSelectedInst] = useState<Set<string>>(new Set());
  const [renegRow, setRenegRow] = useState<AccountReceivable | null>(null);
  /** Quando o operador clica "Renegociar" numa venda inteira, guardamos
   *  todas as parcelas em aberto da venda para renegociação conjunta. */
  const [renegSaleRows, setRenegSaleRows] = useState<AccountReceivable[] | null>(null);
  /** Ação pendente ao selecionar uma parcela dentro do diálogo "Parcelas". */
  const [pendingAction, setPendingAction] = useState<'receber' | 'renegociar' | null>(null);

  // Overlay sequenciado "Recebendo → Imprimindo comprovantes → Emitindo NFC-e → Imprimindo cupom".
  const [nfcePhase, setNfcePhase] = useState<{ label: string; detail?: string } | null>(null);
  const [nfceError, setNfceError] = useState<string | null>(null);
  /**
   * Pausa entre impressões — quando definido, o overlay mostra um botão
   * "Próximo" e o fluxo só continua quando o operador clica (dando tempo
   * dele fechar o diálogo de impressão do navegador antes da próxima nota).
   */
  const [nfceAck, setNfceAck] = useState<null | {
    title: string;
    hint: string;
    resolve: () => void;
  }>(null);

  /** Aguarda o operador clicar em "Próximo" antes de seguir o fluxo. */
  function waitOperatorAck(title: string, hint: string) {
    return new Promise<void>((resolve) => {
      setNfceAck({ title, hint, resolve });
    });
  }

  // NFC-e financeiras (CRED-*) rejeitadas — banner de reemissão.
  type RejectedCredNote = {
    id: string;
    numero: string | null;
    valor_total: number;
    external_id: string;
    sale_id: string | null;
    motivo_rejeicao: string | null;
    request_payload: any;
    created_at: string;
  };
  const [rejectedCredNotes, setRejectedCredNotes] = useState<RejectedCredNote[]>([]);
  const [reemittingId, setReemittingId] = useState<string | null>(null);

  async function loadRejectedCredNotes() {
    if (!company?.id) return;
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('nfce_records')
      .select('id, numero, valor_total, external_id, sale_id, motivo_rejeicao, request_payload, created_at')
      .eq('company_id', company.id)
      .eq('status', 'rejeitada')
      .like('external_id', 'CRED-%')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(20);
    setRejectedCredNotes((data as any[]) || []);
  }
  useEffect(() => { loadRejectedCredNotes(); /* eslint-disable-next-line */ }, [company?.id]);

  async function reemitirNotaRejeitada(rec: RejectedCredNote) {
    if (!company?.id) return;
    setReemittingId(rec.id);
    try {
      const payload = rec.request_payload || {};
      const itens = Array.isArray(payload.itens) ? [...payload.itens] : [];
      if (itens.length === 0) throw new Error('Payload original vazio — não é possível reemitir.');

      // Corrige NCM 00000000 buscando o do produto DIVERSOS (ou qualquer produto com NCM real).
      let ncmReal = '';
      const { data: diversos } = await supabase
        .from('products')
        .select('ncm, tax_rule:tax_rule_id(ncm)')
        .eq('company_id', company.id)
        .ilike('name', '%divers%')
        .limit(1)
        .maybeSingle();
      ncmReal = ((diversos as any)?.ncm || (diversos as any)?.tax_rule?.ncm || '').replace(/\D/g, '');
      if (!ncmReal || ncmReal === '00000000') {
        const { data: anyProd } = await supabase
          .from('products')
          .select('ncm')
          .eq('company_id', company.id)
          .not('ncm', 'is', null)
          .neq('ncm', '')
          .neq('ncm', '00000000')
          .limit(1)
          .maybeSingle();
        ncmReal = ((anyProd as any)?.ncm || '').replace(/\D/g, '');
      }
      if (!ncmReal || ncmReal === '00000000') {
        throw new Error('Nenhum NCM válido encontrado nos cadastros para usar na reemissão.');
      }

      const fixedItens = itens.map((it: any) => {
        const cur = (it.ncm || '').replace(/\D/g, '');
        const withNcm = (!cur || cur === '00000000') ? { ...it, ncm: ncmReal } : it;
        // Reemissão financeira (CFOP 5949):
        //  • CSOSN 400 (não tributada – Simples Nacional): não gera grupo
        //    ICMS-ST, evitando a rejeição [385] que a Fiscal Flow provocava
        //    ao usar 900 (o provider preenchia modBCST/pICMSST automaticamente).
        //  • cClassTrib '000001': classificação tributária alinhada à Reforma
        //    Tributária, idêntica à regra usada em outro ERP homologado.
        return { ...withNcm, csosn: '400', cClassTrib: '000001', classTrib: '000001' };
      });

      // Reutiliza o MESMO external_id da nota rejeitada. Isso força a Fiscal
      // Flow a sobrescrever o registro original (nfce_id existente) em vez de
      // gerar uma nota nova a cada tentativa.
      const newExternalId = String(rec.external_id);
      setNfcePhase({ label: 'Reemitindo NFC-e financeira...', detail: `Nota ${rec.numero || ''} (R$ ${Number(rec.valor_total).toFixed(2).replace('.', ',')})` });

      await emitirNFCe(company.id, rec.sale_id, {
        ...payload,
        external_id: newExternalId,
        natureza_operacao: payload.natureza_operacao || 'Recebimento de crediário',
        itens: fixedItens,
      } as any);

      // Aguarda confirmação
      let newRec: any = null;
      for (let i = 0; i < 6; i++) {
        const { data: r } = await supabase
          .from('nfce_records')
          .select('*')
          .eq('external_id', newExternalId)
          .maybeSingle();
        newRec = r;
        if (newRec && (newRec.status === 'autorizada' || newRec.status === 'rejeitada' || newRec.status === 'erro')) break;
        if (newRec?.nfce_id) { try { await consultarNFCe(company.id, newRec.nfce_id); } catch { /* noop */ } }
        await new Promise((res) => setTimeout(res, 1000));
      }

      if (newRec?.status === 'autorizada') {
        toast.success(`NFC-e financeira nº ${newRec.numero || ''} autorizada.`);
        try { await printDanfeFromRecord(newRec); } catch { try { await printDanfeFromRecordViaIframe(newRec); } catch { /* noop */ } }
      } else if (newRec?.status === 'rejeitada') {
        toast.error(`Rejeitada novamente: ${newRec.motivo_rejeicao || 'Verifique no Monitor NFC-e.'}`);
      } else {
        toast.info('Reemissão enviada. Acompanhe no Monitor NFC-e.');
      }
      await loadRejectedCredNotes();
    } catch (e: any) {
      console.error('[Receitas] reemitir', e);
      toast.error('Falha ao reemitir: ' + (e?.message || e));
    } finally {
      setReemittingId(null);
      setNfcePhase(null);
    }
  }

  const rows = useMemo<FinanceRow[]>(() => items.map((r) => ({
    id: r.id,
    document_number: r.document_number,
    party_name: r.customer_name,
    amount: Number(r.amount),
    balance: Number(r.balance),
    interest_amount: Number(r.interest_amount ?? 0),
    fine_amount: Number(r.fine_amount ?? 0),
    issue_date: r.issue_date,
    due_date: r.due_date,
    status: computeUIStatus(r.status, r.due_date, today),
    description: r.notes || '',
    origin_type: r.origin_type,
    origin_id: r.origin_id,
    tags: r.tags || [],
    pdv_sale_id: r.pdv_sale_id,
  })), [items, today]);

  const filtered = useMemo(() => {
    const list = applyFilters(rows, filters, search);
    return [...list].sort((a, b) => sortAsc ? a.due_date.localeCompare(b.due_date) : b.due_date.localeCompare(a.due_date));
  }, [rows, filters, search, sortAsc]);

  const customerOptions = useMemo(() => {
    const names = new Set<string>();
    for (const it of items) {
      if (it.customer_name?.trim()) names.add(it.customer_name.trim());
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [items]);

  /** Agrupamento por pdv_sale_id: parcelas da mesma venda viram 1 item. */
  const groups = useMemo<GroupItem[]>(() => {
    const bySale = new Map<string, AccountReceivable[]>();
    const singles: GroupItem[] = [];
    const visibleIds = new Set(filtered.map((r) => r.id));
    for (const it of items) {
      if (!visibleIds.has(it.id)) continue;
      if (it.pdv_sale_id) {
        const arr = bySale.get(it.pdv_sale_id) || [];
        arr.push(it);
        bySale.set(it.pdv_sale_id, arr);
      } else {
        singles.push({ kind: 'single', key: it.id, row: it });
      }
    }
    const salesGroups: GroupItem[] = Array.from(bySale.entries()).map(([saleId, parcelas]) => ({
      kind: 'sale' as const,
      key: `sale:${saleId}`,
      saleId,
      parcelas: parcelas.sort((a, b) => a.due_date.localeCompare(b.due_date)),
    }));
    const all = [...salesGroups, ...singles];
    // Ordena pela menor data de vencimento do grupo
    all.sort((a, b) => {
      const da = a.kind === 'sale' ? a.parcelas[0].due_date : a.row.due_date;
      const db = b.kind === 'sale' ? b.parcelas[0].due_date : b.row.due_date;
      return sortAsc ? da.localeCompare(db) : db.localeCompare(da);
    });
    return all;
  }, [items, filtered, sortAsc]);

  const paged = groups.slice((page - 1) * size, page * size);
  const selectionMode = selection.size > 0;

  if (finLoading) return <div className="flex h-[60vh] items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!enabled) return <Navigate to="/" replace />;

  const findAR = (id: string) => items.find((i) => i.id === id) || null;

  /** Imprime UM comprovante de recebimento por parcela paga. */
  async function printReceiptsFor(
    rowsPaid: Array<{
      row: AccountReceivable;
      amountPaid: number;
      payments: Array<{ paymentName: string; amount: number }>;
      interest: number;
      fine: number;
      discount: number;
      surcharge: number;
    }>,
  ) {
    const now = new Date();
    // Recarrega os saldos atualizados em paralelo para montar "saldo restante".
    const payloads: PaymentReceiptPayload[] = [];
    for (const r of rowsPaid) {
      const { data: fresh } = await supabase
        .from('accounts_receivable' as any)
        .select('balance, status')
        .eq('id', r.row.id)
        .maybeSingle();
      const remaining = Number((fresh as any)?.balance ?? 0);
      const paidFlag = ((fresh as any)?.status || '') === 'paid';
      payloads.push({
        paperSize: storeSettings.printerPaperSize,
        storeName: company?.name || storeSettings.storeName || 'Loja',
        storeCnpj: (company as any)?.cnpj || null,
        storeAddress: (company as any)?.address || null,
        storePhone: storeSettings.storePhone || null,
        operatorName: (user as any)?.email || null,
        customerName: r.row.customer_name || 'Cliente',
        customerDocument: (r.row as any).customer_document || null,
        documentNumber: r.row.document_number || r.row.id.slice(0, 8).toUpperCase(),
        installmentLabel: (r.row.notes || '').match(/Parcela\s+\d+\/\d+/i)?.[0] || null,
        amountPaid: r.amountPaid,
        interest: r.interest,
        fine: r.fine,
        discount: r.discount,
        surcharge: r.surcharge,
        remainingBalance: remaining,
        status: paidFlag ? 'paid' : 'partial',
        payments: r.payments,
        issuedAt: now,
      });
    }
    try {
      // UMA janela, N páginas com page-break entre parcelas — a impressora
      // corta entre cada comprovante (nas que têm guilhotina).
      await printPaymentReceiptsConsolidated(payloads);
    } catch (e: any) {
      console.error('[Receitas] falha ao imprimir comprovante', e);
      toast.error('Falha ao imprimir comprovante: ' + (e?.message || e));
    }
  }

  /** Emite NFC-e a partir das parcelas recebidas, reaproveitando os itens
   *  gravados em `pdv_sale_items` da venda de origem. Emite uma nota por
   *  `pdv_sale_id` distinto envolvido no recebimento. */
  async function emitNfceForReceivables(list: AccountReceivable[]) {
    if (!company?.id) return;
    const saleIds = Array.from(
      new Set(list.map((r) => r.pdv_sale_id).filter(Boolean) as string[]),
    );
    if (saleIds.length === 0) {
      toast.info('Título sem venda de origem — NFC-e não emitida.');
      return;
    }
    for (const saleId of saleIds) {
      try {
        setNfcePhase({ label: 'Emitindo NFC-e...', detail: 'Preparando itens da venda' });
        const { data: itemsData, error: itErr } = await supabase
          .from('pdv_sale_items')
          .select('product_id, product_name, quantity, unit_price')
          .eq('sale_id', saleId);
        if (itErr) throw itErr;
        const saleItems = (itemsData as any[]) || [];
        if (saleItems.length === 0) {
          setNfceError('Venda sem itens — NFC-e não emitida.');
          continue;
        }
        // Carrega produtos + regras tributárias envolvidos.
        const productIds = Array.from(
          new Set(saleItems.map((it) => it.product_id).filter(Boolean) as string[]),
        );
        let productsMap = new Map<string, any>();
        let taxRulesMap = new Map<string, any>();
        if (productIds.length) {
          const { data: prods } = await supabase
            .from('products')
            .select('id, code, unit, ncm, cfop, cest, tax_rule_id')
            .in('id', productIds);
          for (const p of (prods as any[]) || []) productsMap.set(p.id, p);
          const taxRuleIds = Array.from(
            new Set(
              ((prods as any[]) || [])
                .map((p) => p.tax_rule_id)
                .filter(Boolean) as string[],
            ),
          );
          if (taxRuleIds.length) {
            const { data: rules } = await supabase
              .from('tax_rules')
              .select('*')
              .in('id', taxRuleIds);
            for (const t of (rules as any[]) || []) taxRulesMap.set(t.id, t);
          }
        }
        const nfceItems: NFCeItem[] = saleItems.map((it) => {
          const product = it.product_id ? productsMap.get(it.product_id) : null;
          const taxRule = product?.tax_rule_id ? taxRulesMap.get(product.tax_rule_id) : null;
          const fallbackNcm = it.product_id ? '00000000' : '21069090';
          return {
            codigo: product?.code || it.product_id || 'AVULSO',
            descricao: it.product_name,
            unidade: (product?.unit as string) || 'UN',
            quantidade: Number(it.quantity) || 1,
            valor_unitario: Number(it.unit_price) || 0,
            ...buildNfceFiscalFields({ product: product as any, taxRule: taxRule as any, mercadoEnabled: true, fallbackNcm }),
          };
        });
        const externalId = `CRED-${saleId.substring(0, 8)}-${Date.now()}`;
        setNfcePhase({ label: 'Emitindo NFC-e...', detail: 'Enviando dados para a SEFAZ' });
        await emitirNFCe(company.id, saleId, {
          external_id: externalId,
          itens: nfceItems,
          valor_desconto: 0,
          valor_frete: 0,
          observacoes: list[0]?.customer_name ? `Cliente: ${list[0].customer_name}` : undefined,
        } as any);
        setNfcePhase({ label: 'Confirmando autorização...', detail: 'Consultando retorno da SEFAZ' });
        await new Promise((r) => setTimeout(r, 200));
        let rec = await getNFCeRecordBySaleId(saleId);
        for (let i = 0; i < 6; i++) {
          if (rec && (rec.status === 'autorizada' || rec.status === 'rejeitada' || rec.status === 'erro')) break;
          setNfcePhase({ label: 'Consultando SEFAZ...', detail: `Tentativa ${i + 1}/6` });
          if (rec?.nfce_id) {
            try { await consultarNFCe(company.id, rec.nfce_id); } catch { /* noop */ }
          }
          await new Promise((r) => setTimeout(r, 1000));
          rec = await getNFCeRecordBySaleId(saleId);
        }
        if (rec?.status === 'autorizada') {
          setNfcePhase({ label: `NFC-e nº ${rec.numero || ''} autorizada`, detail: 'Imprimindo cupom fiscal...' });
          try {
            await printDanfeFromRecord(rec as any);
          } catch {
            try { await printDanfeFromRecordViaIframe(rec as any); } catch (e: any) {
              toast.error(e?.message || 'Erro ao imprimir DANFE');
            }
          }
          toast.success(`NFC-e nº ${rec.numero || ''} autorizada.`);
        } else if (rec) {
          setNfceError(rec.motivo_rejeicao || `NFC-e ${rec.status}. Verifique no Monitor NFC-e.`);
        } else {
          toast.info('NFC-e enviada. Acompanhe no Monitor NFC-e.');
        }
      } catch (e: any) {
        console.error('[Receitas] emitNfceForReceivables', e);
        setNfceError('Falha ao emitir NFC-e: ' + (e?.message || e));
      }
    }
    setNfcePhase(null);
  }

  /**
   * Fase 3 — Crediário Fiscal.
   *
   * Emite a(s) NFC-e do recebimento respeitando `pdv_settings`:
   *
   *  • `credit_sale_fiscal_mode = 'on_sale'` (padrão): a NFC-e da mercadoria
   *    já foi emitida no ato da venda (tPag=05). Aqui emitimos apenas uma
   *    **NFC-e financeira** (CFOP 5949/6949) para a parte paga em TEF, usando
   *    a regra tributária configurada em `credit_receipt_tax_rule_id`.
   *
   *  • `credit_sale_fiscal_mode = 'on_receipt'`: a venda nasceu sem NFC-e.
   *    No primeiro recebimento que envolva TEF, emitimos primeiro a NFC-e
   *    completa da mercadoria (com tPag=05) e depois a NFC-e financeira do
   *    valor TEF. Nos recebimentos seguintes só sai a financeira.
   *
   *  Recebimentos 100% em dinheiro / PIX manual não emitem nota financeira
   *  (a baixa segue com o comprovante de recebimento apenas).
   */
  async function emitCreditReceiptNFCe(
    list: AccountReceivable[],
    payments: EfetivarPayment[],
  ) {
    if (!company?.id) { setNfcePhase(null); return; }
    const saleIds = Array.from(
      new Set(list.map((r) => r.pdv_sale_id).filter(Boolean) as string[]),
    );
    if (saleIds.length === 0) {
      // Título avulso — não há como emitir nota vinculada; ignora silenciosamente.
      setNfcePhase(null);
      return;
    }

    // Total TEF real (com dados NSU/autorização) neste recebimento.
    const tefPayments = payments.filter((p) => p.integration && p.tef);
    const tefTotal = tefPayments.reduce((s, p) => s + p.amount, 0);

    // Pagamentos NÃO-TEF (dinheiro / PIX manual). Quando o operador clica
    // em "EFETIVAR COM NFC-E" em um recebimento sem TEF, também emitimos a
    // nota financeira (5949/6949) — cada linha vira um <detPag> com o tPag
    // adequado (PIX=17, demais=01/dinheiro).
    const cashPayments = payments
      .filter((p) => !(p.integration && p.tef))
      .map((p) => ({
        amount: p.amount,
        isPix: /pix/i.test(p.paymentName || ''),
      }))
      .filter((p) => p.amount > 0.005);
    const cashTotal = cashPayments.reduce((s, p) => s + p.amount, 0);
    const financeTotal = +(tefTotal + cashTotal).toFixed(2);

    // Carrega config do PDV.
    const { data: cfg } = await supabase
      .from('pdv_settings')
      .select('credit_sale_fiscal_mode, credit_receipt_tax_rule_id')
      .eq('company_id', company.id)
      .maybeSingle();
    const mode: 'on_sale' | 'on_receipt' =
      ((cfg as any)?.credit_sale_fiscal_mode as any) || 'on_sale';
    const taxRuleId = (cfg as any)?.credit_receipt_tax_rule_id as string | null;

    let taxRule: any = null;
    if (financeTotal > 0.005) {
      if (!taxRuleId) {
        setNfceError('Regra tributária de crediário não configurada. Configure em Frente de Caixa → Configurações → Financeiro – Crediário.');
        setNfcePhase(null);
        return;
      }
      const { data: rule } = await supabase
        .from('tax_rules')
        .select('*')
        .eq('id', taxRuleId)
        .maybeSingle();
      if (!rule) {
        setNfceError('Regra tributária de crediário não encontrada.');
        setNfcePhase(null);
        return;
      }
      taxRule = rule;

      // NCM 00000000 é rejeitado pela SEFAZ em NFC-e (finalidade 1 normal).
      // Buscamos o NCM efetivo do produto "DIVERSOS" da empresa (via cadastro
      // ou regra tributária dele) para usar como NCM real do item financeiro.
      // Se não encontrar, tenta qualquer produto ativo com NCM preenchido.
      const currentNcm = (taxRule?.ncm || '').replace(/\D/g, '');
      if (!currentNcm || currentNcm === '00000000') {
        const { data: diversos } = await supabase
          .from('products')
          .select('ncm, tax_rule:tax_rule_id(ncm)')
          .eq('company_id', company.id)
          .ilike('name', '%divers%')
          .limit(1)
          .maybeSingle();
        let ncmReal = ((diversos as any)?.ncm || (diversos as any)?.tax_rule?.ncm || '').replace(/\D/g, '');
        if (!ncmReal || ncmReal === '00000000') {
          const { data: anyProd } = await supabase
            .from('products')
            .select('ncm')
            .eq('company_id', company.id)
            .not('ncm', 'is', null)
            .neq('ncm', '')
            .neq('ncm', '00000000')
            .limit(1)
            .maybeSingle();
          ncmReal = ((anyProd as any)?.ncm || '').replace(/\D/g, '');
        }
        if (ncmReal && ncmReal !== '00000000') {
          taxRule = { ...taxRule, ncm: ncmReal };
        }
      }
    }

    const totalBalance = list.reduce((s, r) => s + Number(r.balance || 0), 0) || 1;

    for (const saleId of saleIds) {
      const arRowsOfSale = list.filter((r) => r.pdv_sale_id === saleId);
      const saleBalance = arRowsOfSale.reduce((s, r) => s + Number(r.balance || 0), 0);
      const share = saleBalance / totalBalance;
      const tefForSale = +(tefTotal * share).toFixed(2);
      const cashForSale = +(cashTotal * share).toFixed(2);
      const financeForSale = +(tefForSale + cashForSale).toFixed(2);

      // Destinatário: cliente titular do título (primeiro AR desta venda).
      const arRow = arRowsOfSale[0];
      const docDigits = (arRow.customer_document || '').replace(/\D/g, '');
      const destinatario =
        docDigits.length === 11
          ? { cpf: docDigits, nome: arRow.customer_name || undefined }
          : docDigits.length === 14
            ? { cnpj: docDigits, nome: arRow.customer_name || undefined }
            : undefined;

      // Consulta pdv_sales para pv_numero (usado na descrição da financeira).
      const { data: saleRow } = await supabase
        .from('pdv_sales')
        .select('pv_numero, final_total')
        .eq('id', saleId)
        .maybeSingle();
      const pvNumero = (saleRow as any)?.pv_numero ?? null;

      // Modo B — primeira nota da mercadoria caso ainda não haja uma
      // autorizada para a venda.
      if (mode === 'on_receipt') {
        const { data: prevRecs } = await supabase
          .from('nfce_records')
          .select('id, status, external_id')
          .eq('sale_id', saleId)
          .eq('status', 'autorizada');
        const hasMercadoria = ((prevRecs as any[]) || []).some(
          (r) => !String(r.external_id || '').startsWith('CRED-'),
        );
        if (!hasMercadoria) {
          try {
            await emitNfceForReceivables(arRowsOfSale);
          } catch (e: any) {
            console.error('[Receitas] falha ao emitir mercadoria (on_receipt)', e);
          }
        }
      }

      // Financeira 5949 — emitida sempre que o operador optou por NFC-e
      // neste recebimento (TEF, dinheiro ou PIX manual).
      if (financeForSale <= 0.005 || !taxRule) continue;

      try {
        setNfcePhase({
          label: 'Emitindo NFC-e financeira (5949)...',
          detail: `Recebimento R$ ${financeForSale.toFixed(2).replace('.', ',')}`,
        });

        const descricao = `Recebimento de crediário${pvNumero ? ` - Venda #${pvNumero}` : ''}`;

        // Rastreabilidade: busca a NFC-e de mercadoria original desta venda
        // (registro autorizado cujo external_id NÃO começa com "CRED-").
        let refOrigem = '';
        try {
          const { data: origRecs } = await supabase
            .from('nfce_records')
            .select('numero, serie, chave, external_id, status')
            .eq('sale_id', saleId)
            .eq('status', 'autorizada')
            .order('created_at', { ascending: true });
          const orig = ((origRecs as any[]) || []).find(
            (r) => !String(r.external_id || '').startsWith('CRED-'),
          );
          if (orig) {
            const numSerie = `${orig.numero || '?'}${orig.serie ? `-${orig.serie}` : ''}`;
            refOrigem = ` | NFC-e origem: ${numSerie}${orig.chave ? ` | Chave: ${orig.chave}` : ''}`;
          }
        } catch { /* noop — rastreabilidade é best-effort */ }

        const fiscal = buildNfceFiscalFields({
          product: null,
          taxRule: taxRule as any,
          mercadoEnabled: false,
          fallbackNcm: '00000000',
          fallbackCfop: '5949',
        });
        const financeItem: NFCeItem = {
          codigo: 'REC-CRED',
          descricao,
          unidade: 'UN',
          quantidade: 1,
          valor_unitario: financeForSale,
          ...fiscal,
        };

        // Split de pagamento: reflete o(s) TEF(s) que compõem este rateio.
        // Cada linha (TEF/dinheiro/PIX) entra proporcionalmente ao share
        // desta venda.
        const pagSplit: any[] = [
          ...tefPayments.map((p) => ({
            tipo: 'tef' as const,
            valor: +(p.amount * share).toFixed(2),
            tef: p.tef!,
          })),
          ...cashPayments.map((p) => ({
            tipo: (p.isPix ? 'pix' : 'dinheiro') as 'pix' | 'dinheiro',
            valor: +(p.amount * share).toFixed(2),
          })),
        ].filter((x) => x.valor > 0.005);

        const externalId = `CRED-${saleId.substring(0, 8)}-${Date.now()}`;
        await emitirNFCe(company.id, saleId, {
          external_id: externalId,
          natureza_operacao: 'Recebimento de crediário',
          itens: [financeItem],
          valor_desconto: 0,
          valor_frete: 0,
          observacoes: `${descricao}${arRow.customer_name ? ` | Cliente: ${arRow.customer_name}` : ''}${refOrigem}`,
          pagamentos_split: pagSplit,
          destinatario,
        } as any);

        setNfcePhase({ label: 'Confirmando autorização...', detail: 'Consultando retorno da SEFAZ' });
        await new Promise((r) => setTimeout(r, 300));

        // Busca o registro mais recente desta venda (a financeira que acabamos de emitir).
        let rec: any = null;
        for (let i = 0; i < 6; i++) {
          const { data: recs } = await supabase
            .from('nfce_records')
            .select('*')
            .eq('sale_id', saleId)
            .eq('external_id', externalId)
            .maybeSingle();
          rec = recs;
          if (rec && (rec.status === 'autorizada' || rec.status === 'rejeitada' || rec.status === 'erro')) break;
          setNfcePhase({ label: 'Consultando SEFAZ...', detail: `Tentativa ${i + 1}/6` });
          if (rec?.nfce_id) {
            try { await consultarNFCe(company.id, rec.nfce_id); } catch { /* noop */ }
          }
          await new Promise((r) => setTimeout(r, 1000));
        }

        if (rec?.status === 'autorizada') {
          setNfcePhase({ label: `NFC-e financeira nº ${rec.numero || ''} autorizada`, detail: 'Imprimindo cupom fiscal...' });
          try {
            await printDanfeFromRecord(rec as any);
          } catch {
            try { await printDanfeFromRecordViaIframe(rec as any); } catch (e: any) {
              toast.error(e?.message || 'Erro ao imprimir DANFE');
            }
          }
          toast.success(`NFC-e financeira nº ${rec.numero || ''} autorizada.`);
        } else if (rec) {
          setNfceError(rec.motivo_rejeicao || `NFC-e financeira ${rec.status}. Verifique no Monitor NFC-e.`);
        } else {
          toast.info('NFC-e financeira enviada. Acompanhe no Monitor NFC-e.');
        }
      } catch (e: any) {
        console.error('[Receitas] emitCreditReceiptNFCe', e);
        setNfceError('Falha ao emitir NFC-e financeira: ' + (e?.message || e));
      }
    }
    setNfcePhase(null);
  }

  const openEfetivar = (id: string) => { const r = findAR(id); if (r) setEfetivarRow(r); };
  const openRenegociar = (id: string) => { const r = findAR(id); if (r) setRenegRow(r); };

  /** Escolhe automaticamente a próxima parcela em aberto de uma venda. */
  const firstOpenOf = (g: GroupItem): AccountReceivable | null => {
    if (g.kind === 'single') return g.row.status === 'open' ? g.row : null;
    return g.parcelas.find((p) => p.status === 'open') || null;
  };

  const handleGroupAction = (g: GroupItem, action: 'receber' | 'renegociar') => {
    if (g.kind === 'single') {
      if (g.row.status !== 'open') return;
      action === 'receber' ? openEfetivar(g.row.id) : openRenegociar(g.row.id);
      return;
    }
    // Renegociação sempre atua na venda inteira (todas as parcelas em
    // aberto), sem passar pelo seletor de parcela.
    if (action === 'renegociar') {
      const opens = g.parcelas.filter((p) => p.status === 'open');
      if (opens.length === 0) return;
      setRenegSaleRows(opens);
      return;
    }
    const openCount = g.parcelas.filter((p) => p.status === 'open').length;
    if (openCount === 1) {
      const p = firstOpenOf(g);
      if (p) openEfetivar(p.id);
      return;
    }
    // Recebimento com várias parcelas em aberto: abre o seletor.
    setPendingAction('receber');
    setInstallmentsGroup(g);
  };

  const submitCreate = async (p: import('@/components/financeiro/NewFinanceEntryDialog').NewFinancePayload) => {
    if (!company?.id) return false;
    setBusy(true);
    const n = Math.max(1, p.installments);
    const each = Math.round((p.amount / n) * 100) / 100;
    let createdOk = 0;
    const base = new Date(p.dueDate + 'T00:00:00');
    for (let i = 0; i < n; i++) {
      const due = new Date(base);
      due.setDate(base.getDate() + i * p.installmentIntervalDays);
      const dueStr = due.toISOString().slice(0, 10);
      const amt = i === n - 1 ? +(p.amount - each * (n - 1)).toFixed(2) : each;
      const suffix = n > 1 ? ` (${i + 1}/${n})` : '';
      const id = await create({
        companyId: company.id,
        customerName: p.partyName || 'Sem cliente',
        amount: amt,
        dueDate: dueStr,
        issueDate: p.issueDate,
        documentNumber: p.documentNumber ? `${p.documentNumber}${suffix}` : null,
        notes: p.description || null,
        createdBy: user?.id ?? null,
      });
      if (id) {
        createdOk++;
        if (p.alreadyPaid) {
          await receivePayment({
            receivableId: id, companyId: company.id, amount: amt,
            paymentMethodId: null, paymentName: 'Dinheiro',
            operatorId: user?.id ?? null,
          });
        }
      }
    }
    setBusy(false);
    return createdOk === n;
  };

  const submitEdit = async () => {
    if (!editRow) return;
    setBusy(true);
    const ok = await update(editRow.id, {
      customer_name: editRow.customer_name,
      due_date: editRow.due_date,
      notes: editRow.notes,
    });
    setBusy(false);
    if (ok) setEditRow(null);
  };

  const bulkPay = async () => {
    // Abre o diálogo de recebimento (igual ao checkout do Frente de Caixa)
    // com todas as parcelas selecionadas — permite split, juros/desconto e
    // atalhos por letra.
    const rows = Array.from(selection)
      .map((id) => findAR(id))
      .filter((r): r is AccountReceivable => !!r && r.status === 'open');
    if (rows.length === 0) return;
    if (rows.length === 1) setEfetivarRow(rows[0]);
    else setEfetivarRows(rows);
  };

  const doBulkDelete = async () => {
    setBusy(true);
    for (const id of selection) await remove(id);
    setBusy(false);
    setSelection(new Set());
    setBulkDelete(false);
  };

  return (
    <FinanceModuleLayout kind="receitas" title="Receitas">
      <BulkActionBar
        count={selection.size}
        onClear={() => setSelection(new Set())}
        onBulkPay={bulkPay}
        quitarLabel="Receber selecionados"
      />

      <FinanceSearchBar
        search={search}
        onSearch={(v) => { setSearch(v); setPage(1); }}
        onToggleFilter={() => setFiltersOpen((o) => !o)}
        onToggleSort={() => setSortAsc((s) => !s)}
        onRefresh={reload}
        sortLabel={sortAsc ? 'Vencimento crescente' : 'Vencimento decrescente'}
      />

      <FinanceFilterPanel
        open={filtersOpen} filters={filters} setFilters={setFilters}
        partyLabel="Cliente"
        partyOptions={customerOptions}
        onApply={() => { setPage(1); setFiltersOpen(false); }}
        onClear={() => { setFilters(emptyFilters); setPage(1); }}
      />

      <Card className="bg-muted/30">
        <CardContent className="p-0">
          <Pagination page={page} size={size} total={groups.length} setPage={setPage} setSize={setSize} />
          <div className="border-t border-border" />
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : paged.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Nenhuma venda encontrada.</div>
          ) : (
            <div className="space-y-1 p-2">
              {paged.map((g) => (
                <SaleGroupCard
                  key={g.key}
                  group={g}
                  today={today}
                  onDoubleClick={() => setInstallmentsGroup(g)}
                  onOpenMenu={(el, row) => { setMenuAnchor(el); setMenuTarget(row); }}
                  selectionActive={selection.size > 0}
                  selectedIds={selection}
                  onToggleSelect={(ids, checked) => {
                    setSelection((prev) => {
                      const next = new Set(prev);
                      for (const id of ids) {
                        if (checked) next.add(id); else next.delete(id);
                      }
                      return next;
                    });
                  }}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Parcelas da venda — abre com duplo clique OU quando uma ação
          (Receber/Renegociar) precisa que o operador escolha a parcela. */}
      <Dialog open={!!installmentsGroup} onOpenChange={(o) => { if (!o) { setInstallmentsGroup(null); setPendingAction(null); setSelectedInst(new Set()); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Parcelas da venda</DialogTitle>
            <DialogDescription>
              {pendingAction === 'renegociar'
                ? 'Selecione a parcela que deseja renegociar.'
                : pendingAction === 'receber'
                ? 'Marque uma ou mais parcelas para receber em conjunto, ou use o botão "Receber" da parcela.'
                : 'Visão geral das parcelas dessa venda.'}
            </DialogDescription>
          </DialogHeader>
          {installmentsGroup && (() => {
            const siblings = installmentsGroup.kind === 'sale'
              ? installmentsGroup.parcelas
              : [installmentsGroup.row];
            if (siblings.length === 0) {
              return <div className="text-sm text-muted-foreground py-4">Nenhuma parcela encontrada.</div>;
            }
            const totalAmount = siblings.reduce((s, i) => s + Number(i.amount), 0);
            const totalBalance = siblings.reduce((s, i) => s + Number(i.balance), 0);
            const openSiblings = siblings.filter((s) => s.status === 'open');
            const selectedRows = openSiblings.filter((s) => selectedInst.has(s.id));
            const selectedBalance = selectedRows.reduce((s, r) => s + Number(r.balance), 0);
            const canMulti = pendingAction === 'receber' || pendingAction === null;
            return (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground flex justify-between">
                  <span>Cliente: <b>{siblings[0].customer_name}</b></span>
                  <span>Total: {brl(totalAmount)} · Saldo: {brl(totalBalance)}</span>
                </div>
                <div className="divide-y rounded-md border">
                  {siblings.map((it, idx) => {
                    const uiStatus = computeUIStatus(it.status, it.due_date, today);
                    const isOpen = it.status === 'open';
                    const checked = selectedInst.has(it.id);
                    return (
                      <div key={it.id} className="flex items-center gap-3 p-3">
                        {canMulti && (
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-primary cursor-pointer disabled:opacity-40"
                            disabled={!isOpen}
                            checked={checked}
                            onChange={(e) => {
                              setSelectedInst((prev) => {
                                const next = new Set(prev);
                                if (e.target.checked) next.add(it.id); else next.delete(it.id);
                                return next;
                              });
                            }}
                          />
                        )}
                        <div className="text-xs text-muted-foreground w-12 shrink-0 tabular-nums">
                          {String(idx + 1).padStart(2, '0')}/{String(siblings.length).padStart(2, '0')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium">
                            Vence {it.due_date.split('-').reverse().join('/')}
                            <span className="text-muted-foreground"> · </span>
                            <span className="text-emerald-500">{brl(Number(it.amount))}</span>
                          </div>
                          <div className="text-[11px] text-muted-foreground truncate">
                            Saldo: {brl(Number(it.balance))}
                            {it.document_number ? ` · ${it.document_number}` : ''}
                          </div>
                        </div>
                        <StatusBadge status={uiStatus} />
                        {pendingAction === 'renegociar' ? (
                          <Button size="sm" disabled={!isOpen}
                            onClick={() => { setInstallmentsGroup(null); setPendingAction(null); openRenegociar(it.id); }}>
                            Renegociar
                          </Button>
                        ) : (
                          <Button size="sm" disabled={!isOpen}
                            onClick={() => { setInstallmentsGroup(null); setPendingAction(null); setSelectedInst(new Set()); openEfetivar(it.id); }}>
                            <Check className="h-4 w-4 mr-1" /> Receber
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
                {canMulti && openSiblings.length > 1 && (
                  <div className="flex items-center justify-between gap-3 pt-2">
                    <div className="text-xs text-muted-foreground">
                      <button
                        type="button"
                        className="underline mr-3 hover:text-foreground"
                        onClick={() => setSelectedInst(new Set(openSiblings.map((s) => s.id)))}
                      >Selecionar todas</button>
                      {selectedRows.length > 0 && (
                        <>
                          {selectedRows.length} selecionada(s) · Saldo: <b>{brl(selectedBalance)}</b>
                        </>
                      )}
                    </div>
                    <Button
                      size="sm"
                      disabled={selectedRows.length === 0}
                      onClick={() => {
                        const rows = openSiblings.filter((s) => selectedInst.has(s.id));
                        setInstallmentsGroup(null);
                        setPendingAction(null);
                        setSelectedInst(new Set());
                        if (rows.length === 1) setEfetivarRow(rows[0]);
                        else setEfetivarRows(rows);
                      }}
                    >
                      <Check className="h-4 w-4 mr-1" /> Receber selecionadas
                    </Button>
                  </div>
                )}
              </div>
            );
          })()}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setInstallmentsGroup(null); setPendingAction(null); setSelectedInst(new Set()); }}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FinanceActionMenu
        open={!!menuTarget}
        anchorRef={menuAnchor}
        onClose={() => { setMenuTarget(null); setMenuAnchor(null); }}
        canQuitar={!!menuTarget && menuTarget.status !== 'paga' && menuTarget.status !== 'cancelada'}
        onSelectMark={() => {
          if (!menuTarget) return;
          const g = groups.find((x) => x.key === menuTarget.id || (x.kind === 'sale' && x.saleId === menuTarget.pdv_sale_id));
          const ids = g
            ? (g.kind === 'sale' ? g.parcelas.map((p) => p.id) : [g.row.id])
            : [menuTarget.id];
          setSelection((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.add(id));
            return next;
          });
        }}
        onDetails={() => {
          if (!menuTarget) return;
          const g = groups.find((x) => x.key === menuTarget.id || (x.kind === 'sale' && x.saleId === menuTarget.pdv_sale_id));
          if (g) setDetailsGroup(g);
        }}
        onEdit={() => menuTarget && setEditRow(findAR(menuTarget.id))}
        onQuitar={() => {
          if (!menuTarget) return;
          const g = groups.find((x) => x.key === menuTarget.id || (x.kind === 'sale' && x.saleId === menuTarget.pdv_sale_id));
          if (g) handleGroupAction(g, 'receber');
        }}
        onRenegotiate={() => {
          if (!menuTarget) return;
          const g = groups.find((x) => x.key === menuTarget.id || (x.kind === 'sale' && x.saleId === menuTarget.pdv_sale_id));
          if (g) handleGroupAction(g, 'renegociar');
        }}
        onDelete={() => menuTarget && setDeleteRow(findAR(menuTarget.id))}
        quitarLabel="Receber"
      />

      {/* Detalhes da venda */}
      <DetalhesVendaDialog
        group={detailsGroup}
        onClose={() => setDetailsGroup(null)}
        today={today}
        companyId={company?.id}
        userId={user?.id}
        onReverse={() => reload()}
      />

      {/* Novo diálogo — Efetivar receita (estilo Gweb) */}
      <EfetivarReceitaDialog
        open={!!efetivarRow}
        onOpenChange={(o) => !o && setEfetivarRow(null)}
        receivable={efetivarRow}
        paymentMethods={activePaymentMethods.map((m) => ({ id: m.id, name: m.name, integrationType: m.integration_type }))}
        companyId={company?.id}
        busy={busy}
        onConfirm={async (data) => {
          if (!efetivarRow || !company?.id) return;
          setBusy(true);
          setNfceError(null);
          setNfcePhase({ label: 'Recebendo pagamento...', detail: 'Gravando quitação' });
          const ok = await receivePaymentSplit({
            receivableId: efetivarRow.id,
            companyId: company.id,
            operatorId: user?.id ?? null,
            interest: data.interest, fine: data.fine, discount: data.discount, surcharge: data.surcharge,
            payments: data.payments.map((p) => ({
              amount: p.amount,
              paymentMethodId: p.paymentMethodId,
              paymentName: p.paymentName,
              notes: p.notes ?? null,
            })),
          });
          setBusy(false);
          if (ok) {
            const row = efetivarRow;
            setEfetivarRow(null);
            setSelection(new Set());
            // Imprime 1 comprovante de recebimento para a parcela paga.
            const amountPaid = data.payments.reduce((s, p) => s + p.amount, 0);
            setNfcePhase({ label: 'Imprimindo comprovante...', detail: 'Recebimento de parcela' });
            await printReceiptsFor([{
              row,
              amountPaid,
              payments: data.payments.map((p) => ({ paymentName: p.paymentName, amount: p.amount })),
              interest: data.interest, fine: data.fine, discount: data.discount, surcharge: data.surcharge,
            }]);
            if (data.emitNfce) await emitCreditReceiptNFCe([row], data.payments);
            else setNfcePhase(null);
          } else {
            setNfcePhase(null);
          }
        }}
      />

      {/* Efetivar múltiplas parcelas da mesma venda em um único fluxo.
          Distribui os pagamentos por FIFO entre as parcelas e rateia
          juros/multa/desconto/acréscimo pelo saldo de cada uma. */}
      <EfetivarReceitaDialog
        open={!!efetivarRows}
        onOpenChange={(o) => !o && setEfetivarRows(null)}
        receivable={null}
        receivables={efetivarRows}
        paymentMethods={activePaymentMethods.map((m) => ({ id: m.id, name: m.name, integrationType: m.integration_type }))}
        companyId={company?.id}
        busy={busy}
        onConfirm={async (data) => {
          if (!efetivarRows?.length || !company?.id) return;
          setBusy(true);
          setNfceError(null);
          setNfcePhase({ label: 'Recebendo pagamento...', detail: `${efetivarRows.length} parcelas` });
          const totalBalance = efetivarRows.reduce((s, r) => s + Number(r.balance), 0) || 1;
          const queue = data.payments.map((p) => ({ ...p }));
          let allOk = true;
          // Guarda o "recibo" por parcela para imprimir após todas as gravações.
          const receipts: Array<{
            row: AccountReceivable;
            amountPaid: number;
            payments: Array<{ paymentName: string; amount: number }>;
            interest: number; fine: number; discount: number; surcharge: number;
          }> = [];
          for (const r of efetivarRows) {
            let need = Number(r.balance);
            const local: typeof data.payments = [];
            while (need > 0.005 && queue.length) {
              const p = queue[0];
              const take = Math.min(p.amount, need);
              local.push({
                amount: +take.toFixed(2),
                paymentMethodId: p.paymentMethodId,
                paymentName: p.paymentName,
                // Preserva o fragmento TEF apenas na PRIMEIRA parcela que consome
                // este pagamento — evita duplicar a mesma NSU em várias linhas
                // do accounts_receivable_payments (e no Relatório TEF).
                notes: (p as any)._notesConsumed ? null : (p.notes ?? null),
              });
              (p as any)._notesConsumed = true;
              p.amount = +(p.amount - take).toFixed(2);
              need = +(need - take).toFixed(2);
              if (p.amount < 0.005) queue.shift();
            }
            if (local.length === 0) continue;
            const share = Number(r.balance) / totalBalance;
            const shareInterest = +(data.interest * share).toFixed(2);
            const shareFine = +(data.fine * share).toFixed(2);
            const shareDiscount = +(data.discount * share).toFixed(2);
            const shareSurcharge = +(data.surcharge * share).toFixed(2);
            const ok = await receivePaymentSplit({
              receivableId: r.id,
              companyId: company.id,
              operatorId: user?.id ?? null,
              interest: shareInterest,
              fine: shareFine,
              discount: shareDiscount,
              surcharge: shareSurcharge,
              payments: local,
            });
            if (!ok) { allOk = false; break; }
            receipts.push({
              row: r,
              amountPaid: local.reduce((s, p) => s + p.amount, 0),
              payments: local.map((p) => ({ paymentName: p.paymentName, amount: p.amount })),
              interest: shareInterest, fine: shareFine, discount: shareDiscount, surcharge: shareSurcharge,
            });
          }
          setBusy(false);
          if (allOk) {
            const rowsForNfce = efetivarRows;
            setEfetivarRows(null);
            setSelection(new Set());
            if (receipts.length) {
              setNfcePhase({ label: 'Imprimindo comprovantes...', detail: `${receipts.length} parcelas — corte automático entre elas` });
              await printReceiptsFor(receipts);
            }
            if (data.emitNfce && rowsForNfce) await emitCreditReceiptNFCe(rowsForNfce, data.payments);
            else setNfcePhase(null);
          } else {
            setNfcePhase(null);
          }
        }}
      />

      {/* Novo diálogo — Renegociação */}
      <RenegociarReceitaDialog
        open={!!renegRow}
        onOpenChange={(o) => !o && setRenegRow(null)}
        receivable={renegRow}
        busy={busy}
        onConfirm={async (data) => {
          if (!renegRow || !company?.id) return;
          setBusy(true);
          const ok = await renegotiateSplit({
            receivableId: renegRow.id,
            companyId: company.id,
            userId: user?.id ?? null,
            newTotalAmount: data.newTotalAmount,
            installments: data.installments,
          });
          setBusy(false);
          if (ok) setRenegRow(null);
        }}
      />

      {/* Renegociação da venda inteira (múltiplas parcelas em aberto) */}
      <RenegociarReceitaDialog
        open={!!renegSaleRows}
        onOpenChange={(o) => !o && setRenegSaleRows(null)}
        receivable={null}
        receivables={renegSaleRows}
        busy={busy}
        onConfirm={async (data) => {
          if (!renegSaleRows?.length || !company?.id) return;
          setBusy(true);
          const ok = await renegotiateManySplit({
            receivableIds: renegSaleRows.map((r) => r.id),
            companyId: company.id,
            userId: user?.id ?? null,
            newTotalAmount: data.newTotalAmount,
            installments: data.installments,
          });
          setBusy(false);
          if (ok) setRenegSaleRows(null);
        }}
      />

      {/* Editar */}
      <Dialog open={!!editRow} onOpenChange={(o) => !o && !busy && setEditRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar título</DialogTitle>
          </DialogHeader>
          {editRow && (
            <div className="grid gap-3">
              <div className="grid gap-1.5"><Label>Cliente</Label>
                <Input value={editRow.customer_name} onChange={(e) => setEditRow({ ...editRow, customer_name: e.target.value })} />
              </div>
              <div className="grid gap-1.5"><Label>Vencimento</Label>
                <Input type="date" value={editRow.due_date} onChange={(e) => setEditRow({ ...editRow, due_date: e.target.value })} />
              </div>
              <div className="grid gap-1.5"><Label>Descrição</Label>
                <Textarea value={editRow.notes || ''} onChange={(e) => setEditRow({ ...editRow, notes: e.target.value })} rows={2} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditRow(null)} disabled={busy}>Cancelar</Button>
            <Button onClick={submitEdit} disabled={busy}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewFinanceEntryDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        kind="receita"
        busy={busy}
        onSubmit={submitCreate}
      />

      <ConfirmDialog
        open={!!deleteRow} onOpenChange={(o) => !o && setDeleteRow(null)}
        title="Excluir título" destructive
        description={deleteRow ? `Excluir o título de ${deleteRow.customer_name} (${brl(Number(deleteRow.balance))})?` : ''}
        busy={busy}
        onConfirm={async () => {
          if (!deleteRow) return;
          setBusy(true);
          const ok = await remove(deleteRow.id);
          setBusy(false);
          if (ok) setDeleteRow(null);
        }}
      />

      <ConfirmDialog
        open={bulkDelete} onOpenChange={setBulkDelete}
        title="Excluir selecionados" destructive
        description={`Excluir ${selection.size} título(s)? Essa ação não pode ser desfeita.`}
        busy={busy}
        onConfirm={doBulkDelete}
      />

      <FloatingFab onClick={() => setCreateOpen(true)} label="Nova receita" />

      {/* Overlay sequenciado durante Efetivar → Comprovante → NFC-e → DANFE */}
      {nfcePhase && (
        <div className="fixed inset-0 z-[100] bg-background/85 backdrop-blur-sm flex items-center justify-center">
          <div className="max-w-sm w-full mx-4 rounded-lg border bg-card shadow-xl p-6 text-center">
            <Loader2 className="w-10 h-10 animate-spin text-primary mx-auto mb-3" />
            <div className="text-lg font-semibold">{nfcePhase.label}</div>
            {nfcePhase.detail && (
              <div className="text-sm text-muted-foreground mt-1">{nfcePhase.detail}</div>
            )}
          </div>
        </div>
      )}

      {/* Erro/rejeição da NFC-e — modal para o operador ler o motivo */}
      <Dialog open={!!nfceError} onOpenChange={(o) => !o && setNfceError(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive">NFC-e não autorizada</DialogTitle>
            <DialogDescription>
              O recebimento foi gravado e o comprovante impresso, mas a nota fiscal não pôde ser emitida.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm whitespace-pre-wrap">
            {nfceError}
          </div>
          <DialogFooter>
            <Button onClick={() => setNfceError(null)}>Entendi</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </FinanceModuleLayout>
  );
}

/* ─────────────────────────────────────────────────────────
 *  Card agregado por venda + Dialog "Detalhes da venda"
 *  Definidos inline por serem específicos desta página.
 * ───────────────────────────────────────────────────────── */

function groupStatus(g: GroupItem, today: string) {
  const rows = g.kind === 'sale' ? g.parcelas : [g.row];
  const opens = rows.filter((r) => r.status === 'open');
  if (opens.length === 0) return computeUIStatus('paid', today, today);
  const hasVencida = opens.some((r) => r.due_date < today);
  const hasParcial = rows.some((r) => Number(r.balance) < Number(r.amount) && r.status === 'open');
  if (hasVencida) return 'vencida' as const;
  if (hasParcial) return 'parcial' as const;
  return 'a_vencer' as const;
}

function SaleGroupCard({
  group, today, onDoubleClick, onOpenMenu,
  selectionActive, selectedIds, onToggleSelect,
}: {
  group: GroupItem;
  today: string;
  onDoubleClick: () => void;
  onOpenMenu: (el: HTMLElement, row: FinanceRow) => void;
  selectionActive: boolean;
  selectedIds: Set<string>;
  onToggleSelect: (ids: string[], checked: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const rows = group.kind === 'sale' ? group.parcelas : [group.row];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const balance = rows.reduce((s, r) => s + Number(r.balance), 0);
  const customer = rows[0]?.customer_name || '';
  const nextOpen = rows.filter((r) => r.status === 'open').sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  const status = groupStatus(group, today);
  const parcelasCount = rows.length;
  const isSale = group.kind === 'sale';
  const saleCode = isSale ? `#${group.saleId.replace(/-/g, '').slice(-6).toUpperCase()}` : '';
  const issueDate = rows
    .map((r) => r.issue_date)
    .filter(Boolean)
    .sort()[0];
  const issueDateBR = issueDate ? issueDate.split('-').reverse().join('/') : '';

  const allIds = rows.map((r) => r.id);
  const selectedCount = allIds.filter((id) => selectedIds.has(id)).length;
  const allSelected = selectedCount > 0 && selectedCount === allIds.length;
  const someSelected = selectedCount > 0 && !allSelected;
  const isSaleWithMulti = isSale && rows.length > 1;

  // Row de referência para o menu (usa a próxima em aberto ou a primeira).
  const menuRefRow = nextOpen || rows[0];
  const financeRow: FinanceRow = {
    id: menuRefRow.id,
    document_number: menuRefRow.document_number,
    party_name: menuRefRow.customer_name,
    amount: Number(menuRefRow.amount),
    balance: Number(menuRefRow.balance),
    interest_amount: 0, fine_amount: 0,
    issue_date: menuRefRow.issue_date,
    due_date: menuRefRow.due_date,
    status,
    description: menuRefRow.notes || '',
    origin_type: menuRefRow.origin_type,
    origin_id: menuRefRow.origin_id,
    tags: [],
    pdv_sale_id: menuRefRow.pdv_sale_id,
  };

  return (
    <Card
      className={cn('bg-card/60 cursor-pointer hover:bg-card/80 transition-colors border-destructive/60 hover:border-destructive')}
      onDoubleClick={onDoubleClick}
      title="Duplo clique para ver as parcelas"
    >
      <CardContent className="p-3 flex items-center gap-3">
        {selectionActive && (
          <input
            type="checkbox"
            className="h-4 w-4 accent-primary cursor-pointer shrink-0"
            checked={allSelected}
            ref={(el) => { if (el) el.indeterminate = someSelected; }}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => onToggleSelect(allIds, e.target.checked)}
            aria-label="Selecionar venda"
          />
        )}
        {isSaleWithMulti && (
          <Button
            variant="ghost" size="icon" className="h-7 w-7 shrink-0"
            onClick={(e) => {
              e.stopPropagation();
              setExpanded((x) => {
                const next = !x;
                // Ao expandir, desmarca todas as parcelas para que o operador
                // escolha manualmente quais quer receber.
                if (next && selectedCount > 0) onToggleSelect(allIds, false);
                return next;
              });
            }}
            title={expanded ? 'Recolher parcelas' : 'Expandir parcelas'}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </Button>
        )}
        <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center shrink-0">
          <Receipt className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold truncate">
            {customer}
            {isSale && (
              <>
                <span className="text-muted-foreground font-normal"> · </span>
                <span className="font-mono text-xs">{saleCode}</span>
                {issueDateBR && (
                  <span className="text-muted-foreground font-normal font-mono text-xs"> {issueDateBR}</span>
                )}
              </>
            )}
            <span className="text-muted-foreground font-normal"> · </span>
            {parcelasCount > 1 ? `${parcelasCount} parcelas` : '1 título'}
            <span className="text-muted-foreground font-normal"> · Total: </span>
            <span className="text-emerald-500">{brl(total)}</span>
          </div>
          <div className="text-xs text-muted-foreground">
            Saldo em aberto: <b>{brl(balance)}</b>
            {nextOpen && ` · Próx. vencimento: ${nextOpen.due_date.split('-').reverse().join('/')}`}
            {selectionActive && selectedCount > 0 && selectedCount < allIds.length && (
              <> · <span className="text-primary">{selectedCount}/{allIds.length} parcela(s)</span></>
            )}
          </div>
        </div>
        {!isSale && <StatusBadge status={status} />}
        <Button
          variant="ghost" size="icon" className="h-8 w-8"
          onClick={(e) => { e.stopPropagation(); onOpenMenu(e.currentTarget, financeRow); }}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </CardContent>
      {isSaleWithMulti && expanded && (
        <div
          className="border-t bg-muted/20 divide-y"
          onClick={(e) => e.stopPropagation()}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          {rows.map((r, idx) => {
            const uiStatus = computeUIStatus(r.status, r.due_date, today);
            const isOpen = r.status === 'open';
            const checked = selectedIds.has(r.id);
            return (
              <div key={r.id} className="flex items-center gap-3 px-3 py-2 pl-10">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary cursor-pointer shrink-0 disabled:opacity-40"
                  disabled={!isOpen}
                  checked={checked}
                  onChange={(e) => onToggleSelect([r.id], e.target.checked)}
                  aria-label={`Selecionar parcela ${idx + 1}`}
                />
                <div className="text-xs text-muted-foreground w-12 shrink-0 tabular-nums">
                  {String(idx + 1).padStart(2, '0')}/{String(rows.length).padStart(2, '0')}
                </div>
                <div className="flex-1 min-w-0 text-xs">
                  <span className="font-medium">
                    Vence {r.due_date.split('-').reverse().join('/')}
                  </span>
                  <span className="text-muted-foreground"> · </span>
                  <span className="text-emerald-500">{brl(Number(r.amount))}</span>
                  <span className="text-muted-foreground"> · Saldo {brl(Number(r.balance))}</span>
                </div>
                <StatusBadge status={uiStatus} />
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function DetalhesVendaDialog({
  group, onClose, today, companyId, userId, onReverse,
}: {
  group: GroupItem | null;
  onClose: () => void;
  today: string;
  companyId?: string;
  userId?: string | null;
  onReverse?: () => void;
}) {
  if (!group) return null;
  const rows = group.kind === 'sale' ? group.parcelas : [group.row];
  const ref = rows[0];
  const total = rows.reduce((s, r) => s + Number(r.amount), 0);
  const paid = rows.reduce((s, r) => s + (Number(r.amount) - Number(r.balance)), 0);
  const balance = rows.reduce((s, r) => s + Number(r.balance), 0);
  const { reversePayment } = useAccountsReceivable(companyId);
  const [history, setHistory] = useState<any[]>([]);
  const [loadingHist, setLoadingHist] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      if (!group) return;
      setLoadingHist(true);
      const ids = rows.map((r) => r.id);
      const { data } = await supabase
        .from('accounts_receivable_payments' as any)
        .select('id, receivable_id, amount, payment_name, notes, paid_at, reversed_at, reversal_reason')
        .in('receivable_id', ids)
        .order('paid_at', { ascending: true });
      setHistory(((data as any[]) || []));
      setLoadingHist(false);
    })();
     
  }, [group]);

  const handleReverse = async (paymentId: string) => {
    if (!companyId) return;
    const reason = window.prompt('Motivo do estorno (obrigatório):');
    if (!reason?.trim()) return;
    setReversingId(paymentId);
    const ok = await reversePayment({ paymentId, companyId, reason, userId: userId ?? null });
    setReversingId(null);
    if (ok) {
      // recarrega histórico local
      const ids = rows.map((r) => r.id);
      const { data } = await supabase
        .from('accounts_receivable_payments' as any)
        .select('id, receivable_id, amount, payment_name, notes, paid_at, reversed_at, reversal_reason')
        .in('receivable_id', ids)
        .order('paid_at', { ascending: true });
      setHistory(((data as any[]) || []));
      onReverse?.();
    }
  };

  return (
    <Dialog open={!!group} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detalhes da venda</DialogTitle>
        </DialogHeader>

        <div className="grid gap-2 text-sm">
          <div className="grid grid-cols-2 gap-2 rounded-md border p-3">
            <div><span className="text-muted-foreground">Cliente:</span> <b>{ref.customer_name}</b></div>
            <div><span className="text-muted-foreground">Documento:</span> {ref.customer_document || '—'}</div>
            <div><span className="text-muted-foreground">Telefone:</span> {ref.customer_phone || '—'}</div>
            <div><span className="text-muted-foreground">Emissão:</span> {ref.issue_date.split('-').reverse().join('/')}</div>
            {group.kind === 'sale' && (
              <div className="col-span-2">
                <span className="text-muted-foreground">Venda (PDV):</span> {group.saleId}
              </div>
            )}
            {ref.notes && (
              <div className="col-span-2"><span className="text-muted-foreground">Obs:</span> {ref.notes}</div>
            )}
          </div>

          <div className="rounded-md border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-xs text-muted-foreground">
                <tr>
                  <th className="text-left px-3 py-2 font-normal">#</th>
                  <th className="text-left px-3 py-2 font-normal">Documento</th>
                  <th className="text-left px-3 py-2 font-normal">Vencimento</th>
                  <th className="text-right px-3 py-2 font-normal">Valor</th>
                  <th className="text-right px-3 py-2 font-normal">Recebido</th>
                  <th className="text-right px-3 py-2 font-normal">Saldo</th>
                  <th className="text-left px-3 py-2 font-normal">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r, i) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2">{i + 1}</td>
                    <td className="px-3 py-2">{r.document_number || '—'}</td>
                    <td className="px-3 py-2">{r.due_date.split('-').reverse().join('/')}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(r.amount))}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(r.amount) - Number(r.balance))}</td>
                    <td className="px-3 py-2 text-right">{brl(Number(r.balance))}</td>
                    <td className="px-3 py-2"><StatusBadge status={computeUIStatus(r.status, r.due_date, today)} /></td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t bg-muted/20">
                <tr className="text-sm">
                  <td colSpan={3} className="px-3 py-2 text-right font-semibold">TOTAIS</td>
                  <td className="px-3 py-2 text-right font-semibold">{brl(total)}</td>
                  <td className="px-3 py-2 text-right">{brl(paid)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{brl(balance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="rounded-md border">
            <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b bg-muted/20">
              Histórico de recebimentos
            </div>
            {loadingHist ? (
              <div className="p-3 text-xs text-muted-foreground">Carregando…</div>
            ) : history.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground">Nenhum recebimento registrado.</div>
            ) : (
              <table className="w-full text-xs">
                <thead className="text-muted-foreground">
                  <tr>
                    <th className="text-left px-3 py-2 font-normal">Data</th>
                    <th className="text-left px-3 py-2 font-normal">Forma</th>
                    <th className="text-right px-3 py-2 font-normal">Valor</th>
                    <th className="text-left px-3 py-2 font-normal">Situação</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {history.map((h) => (
                    <tr key={h.id} className={h.reversed_at ? 'opacity-60' : ''}>
                      <td className="px-3 py-2 tabular-nums">
                        {new Date(h.paid_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                      </td>
                      <td className="px-3 py-2">{h.payment_name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{brl(Number(h.amount))}</td>
                      <td className="px-3 py-2">
                        {h.reversed_at ? (
                          <span className="text-destructive">Estornado</span>
                        ) : (
                          <span className="text-emerald-500">Ativo</span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {!h.reversed_at && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-destructive hover:text-destructive"
                            disabled={reversingId === h.id}
                            onClick={() => handleReverse(h.id)}
                          >
                            {reversingId === h.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              'Estornar'
                            )}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}