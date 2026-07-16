import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { BookMarked, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';

import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

import { useAuthContext } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { parseNfceXml, labelTPag, type ParsedFiscalXml } from '@/utils/parseNfceXml';

function fmtMoney(v: number) {
  return Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function firstDayOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type Modelo = '65' | '55';
type StatusFiltro = 'todos' | 'autorizada' | 'cancelada';

interface Row {
  id: string;
  modelo: Modelo;
  dataEmissao: string; // ISO
  numero: string;
  serie: string;
  chave: string;
  valor: number;
  cfop: string;
  natureza: string;
  pagamento: string;
  pagamentosXml: PaymentInfo[];
  status: 'autorizada' | 'cancelada';
  fonte: 'XML' | 'Local';
}

type PaymentInfo = {
  code: string;
  label: string;
  value?: number;
};

const TPAG_LABELS: Record<string, string> = {
  '01': 'Dinheiro',
  '02': 'Cheque',
  '03': 'Cartão de Crédito',
  '04': 'Cartão de Débito',
  '05': 'Crédito Loja',
  '10': 'Vale Alimentação',
  '11': 'Vale Refeição',
  '12': 'Vale Presente',
  '13': 'Vale Combustível',
  '15': 'Boleto Bancário',
  '16': 'Depósito Bancário',
  '17': 'PIX',
  '18': 'Transferência Bancária',
  '19': 'Programa de Fidelidade',
  '90': 'Sem Pagamento',
  '99': 'Outros',
};

function paymentLabel(code?: string | number | null): string {
  const normalized = String(code || '').padStart(2, '0');
  return `${normalized} - ${TPAG_LABELS[normalized] || 'Outros'}`;
}

function paymentCodeFromType(type?: string): string {
  const t = String(type || '').toLowerCase();
  if (t === 'credit') return '03';
  if (t === 'debit') return '04';
  if (t === 'pix') return '17';
  return '99';
}

function parseMoneyLike(value: any): number | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  const n = typeof value === 'number'
    ? value
    : Number(String(value).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function normalizePayments(payments: PaymentInfo[]): PaymentInfo[] {
  const map = new Map<string, PaymentInfo>();
  for (const p of payments) {
    if (!p.code) continue;
    const existing = map.get(p.code);
    if (!existing) {
      map.set(p.code, { ...p, label: paymentLabel(p.code) });
      continue;
    }
    if (p.value !== undefined) existing.value = Number(existing.value || 0) + p.value;
  }
  return Array.from(map.values());
}

function formatPayments(payments: PaymentInfo[]): string {
  if (!payments.length) return '—';
  const showValues = payments.length > 1;
  return payments
    .map((p) => showValues && p.value !== undefined ? `${p.label} (${fmtMoney(p.value)})` : p.label)
    .join(' + ');
}

function maybeDecodeBase64Xml(value: string): string {
  if (value.includes('<detPag') || value.includes('<NFe') || value.includes('<nfeProc')) return value;
  try {
    const decoded = atob(value);
    if (decoded.includes('<detPag') || decoded.includes('<NFe') || decoded.includes('<nfeProc')) return decoded;
  } catch {
    // não era base64
  }
  return value;
}

function findXmlString(source: any, depth = 0): string | null {
  if (!source || depth > 5) return null;
  if (typeof source === 'string') {
    const xml = maybeDecodeBase64Xml(source);
    return xml.includes('<detPag') || xml.includes('<NFe') || xml.includes('<nfeProc') ? xml : null;
  }
  if (Array.isArray(source)) {
    for (const item of source) {
      const xml = findXmlString(item, depth + 1);
      if (xml) return xml;
    }
    return null;
  }
  if (typeof source === 'object') {
    const preferredKeys = ['xml_retorno', 'xmlRetorno', 'xml', 'xml_nfe', 'xmlNfe', 'procNFe', 'conteudo_xml'];
    for (const key of preferredKeys) {
      const xml = findXmlString(source[key], depth + 1);
      if (xml) return xml;
    }
    for (const value of Object.values(source)) {
      const xml = findXmlString(value, depth + 1);
      if (xml) return xml;
    }
  }
  return null;
}

function extractPaymentsFromXml(xml: string | null): PaymentInfo[] {
  if (!xml) return [];
  try {
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    if (!doc.getElementsByTagName('parsererror').length) {
      const payments = Array.from(doc.getElementsByTagName('detPag')).map((det) => {
        const code = det.getElementsByTagName('tPag')[0]?.textContent?.trim() || '';
        const value = parseMoneyLike(det.getElementsByTagName('vPag')[0]?.textContent?.trim());
        return { code, label: paymentLabel(code), value };
      });
      return normalizePayments(payments);
    }
  } catch {
    // fallback regex abaixo
  }

  const payments: PaymentInfo[] = [];
  for (const match of xml.matchAll(/<detPag\b[\s\S]*?<\/detPag>/g)) {
    const block = match[0];
    const code = block.match(/<tPag>(.*?)<\/tPag>/)?.[1]?.trim() || '';
    const value = parseMoneyLike(block.match(/<vPag>(.*?)<\/vPag>/)?.[1]?.trim());
    payments.push({ code, label: paymentLabel(code), value });
  }
  return normalizePayments(payments);
}

function extractPaymentsFromFiscalPayload(payload: any): PaymentInfo[] {
  if (!payload) return [];

  const detPag = payload?.pag?.detPag || payload?.detPag;
  if (Array.isArray(detPag) && detPag.length) {
    return normalizePayments(detPag.map((p: any) => ({
      code: String(p?.tPag || ''),
      label: paymentLabel(p?.tPag),
      value: parseMoneyLike(p?.vPag),
    })));
  }

  if (Array.isArray(payload?.pagamentos) && payload.pagamentos.length) {
    return normalizePayments(payload.pagamentos.map((p: any) => ({
      code: String(p?.tPag || p?.forma_pagamento || ''),
      label: paymentLabel(p?.tPag || p?.forma_pagamento),
      value: parseMoneyLike(p?.vPag || p?.valor_pagamento || p?.valor),
    })));
  }

  if (Array.isArray(payload?.formas_pagamento) && payload.formas_pagamento.length) {
    return normalizePayments(payload.formas_pagamento.map((p: any) => ({
      code: String(p?.forma_pagamento || p?.tPag || ''),
      label: paymentLabel(p?.forma_pagamento || p?.tPag),
      value: parseMoneyLike(p?.valor_pagamento || p?.vPag || p?.valor),
    })));
  }

  if (payload?.pagamento) {
    const p = payload.pagamento;
    return normalizePayments([{
      code: String(p?.tPag || p?.forma_pagamento || ''),
      label: paymentLabel(p?.tPag || p?.forma_pagamento),
      value: parseMoneyLike(p?.vPag || p?.valor_pagamento || p?.valor),
    }]);
  }

  if (Array.isArray(payload?.pagamentos_split) && payload.pagamentos_split.length) {
    return normalizePayments(payload.pagamentos_split.map((p: any) => {
      const code = p?.tipo === 'tef'
        ? paymentCodeFromType(p?.tef?.tipo_pagamento)
        : p?.tipo === 'crediario'
          ? '05'
          : p?.tipo === 'pix'
            ? '17'
            : p?.tipo === 'cash'
              ? '01'
              : '99';
      return { code, label: paymentLabel(code), value: parseMoneyLike(p?.valor) };
    }));
  }

  return [];
}

function extractFiscalPayments(record: any): PaymentInfo[] {
  const xml = findXmlString(record?.response_payload) || findXmlString(record?.webhook_payload);
  const fromXml = extractPaymentsFromXml(xml);
  if (fromXml.length) return fromXml;

  // Fallback fiscal: só usa payloads fiscais da nota. Não consulta a venda/caixa.
  return extractPaymentsFromFiscalPayload(record?.request_payload);
}

function extractCfopsFromPayload(payload: any): string[] {
  if (!payload) return [];
  const itens =
    payload?.itens ||
    payload?.items ||
    payload?.produtos ||
    payload?.nfce?.itens ||
    payload?.nfe?.itens ||
    [];
  const set = new Set<string>();
  if (Array.isArray(itens)) {
    for (const it of itens) {
      const c = it?.cfop || it?.CFOP || it?.icms?.cfop || it?.produto?.cfop;
      if (c) set.add(String(c));
    }
  }
  return Array.from(set);
}

export default function EspelhoFiscal() {
  const { company } = useAuthContext();

  const [dateFrom, setDateFrom] = useState<string>(firstDayOfMonth());
  const [dateTo, setDateTo] = useState<string>(today());
  const [modelo, setModelo] = useState<'todos' | Modelo>('todos');
  const [statusFiltro, setStatusFiltro] = useState<StatusFiltro>('todos');
  const [serie, setSerie] = useState<string>('todas');

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [seriesDisponiveis, setSeriesDisponiveis] = useState<string[]>([]);

  async function generate() {
    if (!company?.id) return;
    if (!dateFrom || !dateTo) {
      toast.error('Informe o período');
      return;
    }
    setLoading(true);
    setProgress(null);
    try {
      const fromIso = `${dateFrom}T00:00:00-03:00`;
      const toIso = `${dateTo}T23:59:59-03:00`;
      const wantStatus = statusFiltro === 'todos' ? ['autorizada', 'cancelada'] : [statusFiltro];

      const collected: Row[] = [];

      // NFC-e (modelo 65)
      if (modelo === 'todos' || modelo === '65') {
        const { data, error } = await (supabase as any)
          .from('nfce_records')
          .select('id, nfce_id, sale_id, numero, serie, chave_acesso, valor_total, status, created_at, xml_content, request_payload, response_payload, webhook_payload')
          .eq('company_id', company.id)
          .in('status', wantStatus)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: true });
        if (error) throw error;

        // Backfill sob demanda: para cada registro sem xml_content mas com nfce_id,
        // busca via nfce-proxy (que também persiste em xml_content).
        const semXml = (data || []).filter((r: any) => !r.xml_content && r.nfce_id && r.status === 'autorizada');
        if (semXml.length) {
          setProgress({ done: 0, total: semXml.length });
          const CONCURRENCY = 4;
          let idx = 0;
          let done = 0;
          async function worker() {
            while (idx < semXml.length) {
              const my = idx++;
              const rec = semXml[my];
              try {
                const { data: resp } = await supabase.functions.invoke('nfce-proxy', {
                  body: { action: 'xml', companyId: company.id, nfceId: rec.nfce_id },
                });
                const xml = resp?.xml || resp?.data?.xml;
                if (xml && typeof xml === 'string') {
                  rec.xml_content = xml;
                }
              } catch (e) {
                console.warn('[EspelhoFiscal] xml backfill falhou', rec.id, e);
              }
              done++;
              setProgress({ done, total: semXml.length });
            }
          }
          await Promise.all(Array.from({ length: Math.min(CONCURRENCY, semXml.length) }, worker));
        }

        for (const r of data || []) {
          const parsed: ParsedFiscalXml | null = parseNfceXml(r.xml_content);
          if (parsed) {
            // Fonte de verdade: XML autorizado da SEFAZ
            const pagamentosXml: PaymentInfo[] = parsed.pagamentos.map((p) => ({
              code: p.tPag,
              label: labelTPag(p.tPag),
              value: p.vPag,
            }));
            const statusXml: 'autorizada' | 'cancelada' = parsed.cStat === '101' ? 'cancelada' : (r.status as any);
            collected.push({
              id: r.id,
              modelo: parsed.modelo,
              dataEmissao: parsed.dhEmi || r.created_at,
              numero: parsed.numero || r.numero || '—',
              serie: parsed.serie || r.serie || '—',
              chave: parsed.chave || r.chave_acesso || '',
              valor: parsed.vNF || Number(r.valor_total || 0),
              cfop: parsed.cfops.join(', ') || '—',
              natureza: parsed.natOp || '—',
              pagamento: formatPayments(pagamentosXml),
              pagamentosXml,
              status: statusXml,
              fonte: 'XML',
            });
          } else {
            // Fallback: XML ainda indisponível (contingência recém-autorizada,
            // erro de download etc.). Marca como fonte "Local" e usa payload.
            const cfops = extractCfopsFromPayload(r.request_payload);
            const pagamentosXml = extractFiscalPayments(r);
            collected.push({
              id: r.id,
              modelo: '65',
              dataEmissao: r.created_at,
              numero: r.numero || '—',
              serie: r.serie || '—',
              chave: r.chave_acesso || '',
              valor: Number(r.valor_total || 0),
              cfop: cfops.join(', ') || '—',
              natureza: cfops.length > 0 ? 'Venda de mercadoria' : '—',
              pagamento: formatPayments(pagamentosXml),
              pagamentosXml,
              status: r.status as 'autorizada' | 'cancelada',
              fonte: 'Local',
            });
          }
        }

        // Fallback CFOP secundário: só para linhas ainda em fonte "Local".
        const idxSemCfop: number[] = [];
        const salesSemCfop: string[] = [];
        collected.forEach((row, i) => {
          if (row.modelo === '65' && row.cfop === '—' && row.fonte === 'Local') {
            const original = (data || []).find((r: any) => r.id === row.id);
            if (original?.sale_id) {
              idxSemCfop.push(i);
              salesSemCfop.push(original.sale_id);
            }
          }
        });
        if (salesSemCfop.length) {
          const { data: itens } = await (supabase as any)
            .from('pdv_sale_items')
            .select('sale_id, product_id')
            .in('sale_id', Array.from(new Set(salesSemCfop)));
          const prodIds = Array.from(
            new Set((itens || []).map((it: any) => it.product_id).filter(Boolean)),
          );
          const prodCfop = new Map<string, string>();
          if (prodIds.length) {
            const { data: prods } = await (supabase as any)
              .from('products')
              .select('id, cfop')
              .in('id', prodIds);
            for (const p of prods || []) if (p.cfop) prodCfop.set(p.id, String(p.cfop));
          }
          const cfopsPorVenda = new Map<string, Set<string>>();
          for (const it of itens || []) {
            const c = prodCfop.get(it.product_id);
            if (!c) continue;
            const set = cfopsPorVenda.get(it.sale_id) || new Set<string>();
            set.add(c);
            cfopsPorVenda.set(it.sale_id, set);
          }
          for (const i of idxSemCfop) {
            const original = (data || []).find((r: any) => r.id === collected[i].id);
            const set = cfopsPorVenda.get(original?.sale_id);
            if (set && set.size) {
              const arr = Array.from(set);
              collected[i].cfop = arr.join(', ');
              if (collected[i].natureza === '—') collected[i].natureza = 'Venda de mercadoria';
            }
          }
        }
      }

      // NF-e (modelo 55)
      if (modelo === 'todos' || modelo === '55') {
        const { data, error } = await (supabase as any)
          .from('nfe_records')
          .select('id, numero, serie, chave_acesso, valor_total, status, created_at, natureza_operacao, request_payload, response_payload, webhook_payload')
          .eq('company_id', company.id)
          .in('status', wantStatus)
          .gte('created_at', fromIso)
          .lte('created_at', toIso)
          .order('created_at', { ascending: true });
        if (error) throw error;

        for (const r of data || []) {
          // NF-e (modelo 55): tenta parsear XML embutido em response/webhook payload.
          const xmlStr = findXmlString(r.response_payload) || findXmlString(r.webhook_payload);
          const parsed = parseNfceXml(xmlStr);
          if (parsed) {
            const pagamentosXml: PaymentInfo[] = parsed.pagamentos.map((p) => ({
              code: p.tPag,
              label: labelTPag(p.tPag),
              value: p.vPag,
            }));
            collected.push({
              id: r.id,
              modelo: '55',
              dataEmissao: parsed.dhEmi || r.created_at,
              numero: parsed.numero || r.numero || '—',
              serie: parsed.serie || r.serie || '—',
              chave: parsed.chave || r.chave_acesso || '',
              valor: parsed.vNF || Number(r.valor_total || 0),
              cfop: parsed.cfops.join(', ') || '—',
              natureza: parsed.natOp || r.natureza_operacao || '—',
              pagamento: formatPayments(pagamentosXml),
              pagamentosXml,
              status: (parsed.cStat === '101' ? 'cancelada' : r.status) as 'autorizada' | 'cancelada',
              fonte: 'XML',
            });
            continue;
          }
          const cfops = extractCfopsFromPayload(r.request_payload);
          const pagamentosXml = extractFiscalPayments(r);
          collected.push({
            id: r.id,
            modelo: '55',
            dataEmissao: r.created_at,
            numero: r.numero || '—',
            serie: r.serie || '—',
            chave: r.chave_acesso || '',
            valor: Number(r.valor_total || 0),
            cfop: cfops.join(', ') || '—',
            natureza: r.natureza_operacao || '—',
            pagamento: formatPayments(pagamentosXml),
            pagamentosXml,
            status: r.status as 'autorizada' | 'cancelada',
            fonte: 'Local',
          });
        }
      }

      collected.sort((a, b) => (a.dataEmissao < b.dataEmissao ? -1 : 1));
      setRows(collected);
      setSeriesDisponiveis(Array.from(new Set(collected.map((r) => r.serie))).sort());
      setGeneratedAt(new Date());
    } catch (err: any) {
      console.error('[EspelhoFiscal] erro:', err);
      toast.error('Falha ao gerar espelho', { description: err?.message });
    } finally {
      setLoading(false);
      setProgress(null);
    }
  }

  const filteredRows = useMemo(() => {
    if (serie === 'todas') return rows;
    return rows.filter((r) => r.serie === serie);
  }, [rows, serie]);

  const totals = useMemo(() => {
    let qtdAut = 0, qtdCanc = 0, somaAut = 0, somaCanc = 0;
    const porCfop = new Map<string, { qtd: number; valor: number }>();
    const porPag = new Map<string, { qtd: number; valor: number }>();
    for (const r of filteredRows) {
      if (r.status === 'autorizada') { qtdAut++; somaAut += r.valor; }
      else { qtdCanc++; somaCanc += r.valor; }
      const c = r.cfop || '—';
      const cAcc = porCfop.get(c) || { qtd: 0, valor: 0 };
      cAcc.qtd += 1; cAcc.valor += r.status === 'autorizada' ? r.valor : 0;
      porCfop.set(c, cAcc);
      const pagamentos = r.pagamentosXml.length ? r.pagamentosXml : [{ code: '—', label: '—', value: r.valor }];
      for (const p of pagamentos) {
        const key = p.label || '—';
        const pAcc = porPag.get(key) || { qtd: 0, valor: 0 };
        pAcc.qtd += 1;
        pAcc.valor += r.status === 'autorizada' ? Number(p.value ?? r.valor) : 0;
        porPag.set(key, pAcc);
      }
    }
    return { qtdAut, qtdCanc, somaAut, somaCanc, porCfop, porPag };
  }, [filteredRows]);

  async function exportExcel() {
    if (!filteredRows.length) return;
    const XLSX = await import('xlsx');
    const header = ['Data', 'Modelo', 'Nº', 'Série', 'Chave de Acesso', 'CFOP', 'Natureza', 'Pagamento', 'Valor', 'Status'];
    const data = filteredRows.map((r) => [
      format(new Date(r.dataEmissao), 'dd/MM/yyyy HH:mm'),
      r.modelo,
      r.numero,
      r.serie,
      r.chave,
      r.cfop,
      r.natureza,
      r.pagamento,
      r.valor,
      r.status === 'autorizada' ? 'Autorizada' : 'Cancelada',
    ]);
    const ws = XLSX.utils.aoa_to_sheet([
      [`Espelho Fiscal — ${company?.name || ''}`],
      [`Período: ${format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')}`],
      [`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`],
      [],
      header,
      ...data,
      [],
      ['Totais'],
      ['Autorizadas', totals.qtdAut, '', '', '', '', '', '', totals.somaAut],
      ['Canceladas', totals.qtdCanc, '', '', '', '', '', '', totals.somaCanc],
    ]);
    ws['!cols'] = [
      { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 8 }, { wch: 48 },
      { wch: 16 }, { wch: 28 }, { wch: 22 }, { wch: 12 }, { wch: 12 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Espelho Fiscal');
    XLSX.writeFile(wb, `espelho-fiscal-${dateFrom}-a-${dateTo}.xlsx`);
  }

  async function exportPDF() {
    if (!filteredRows.length) return;
    const { jsPDF } = await import('jspdf');
    const autoTableMod: any = await import('jspdf-autotable');
    const autoTable = autoTableMod.default || autoTableMod;

    const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    doc.setFontSize(14);
    doc.text('Espelho Fiscal', 40, 40);
    doc.setFontSize(10);
    doc.text(company?.name || '', 40, 58);
    if ((company as any)?.cnpj) doc.text(`CNPJ: ${(company as any).cnpj}`, 40, 72);
    doc.text(
      `Período: ${format(new Date(dateFrom + 'T00:00:00'), 'dd/MM/yyyy')} a ${format(new Date(dateTo + 'T00:00:00'), 'dd/MM/yyyy')}`,
      40, 86,
    );
    doc.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 40, 100);

    autoTable(doc, {
      startY: 115,
      head: [['Data', 'Mod.', 'Nº', 'Sér.', 'Chave', 'CFOP', 'Natureza', 'Pagamento', 'Valor', 'Status']],
      body: filteredRows.map((r) => [
        format(new Date(r.dataEmissao), 'dd/MM/yy HH:mm'),
        r.modelo,
        r.numero,
        r.serie,
        r.chave,
        r.cfop,
        r.natureza,
        r.pagamento,
        fmtMoney(r.valor),
        r.status === 'autorizada' ? 'AUT' : 'CANC',
      ]),
      foot: [[
        '', '', '', '', '', '', '',
        `Autoriz.: ${totals.qtdAut}  Canc.: ${totals.qtdCanc}`,
        fmtMoney(totals.somaAut),
        '',
      ]],
      styles: { fontSize: 7, cellPadding: 3 },
      headStyles: { fillColor: [51, 65, 85] },
      footStyles: { fillColor: [226, 232, 240], textColor: 20, fontStyle: 'bold' },
      columnStyles: {
        4: { cellWidth: 200, font: 'courier', fontSize: 6 },
        8: { halign: 'right' },
      },
    });

    doc.save(`espelho-fiscal-${dateFrom}-a-${dateTo}.pdf`);
  }

  useEffect(() => {
    // primeira geração automática
    if (company?.id && !generatedAt) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <BookMarked className="w-6 h-6" />
              Espelho Fiscal
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Relatório consolidado de notas emitidas (NFC-e modelo 65 e NF-e modelo 55) para entrega à contabilidade.
            </p>
          </div>
          <Badge variant="outline">Fiscal</Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Filtros</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="space-y-1.5">
                <Label>De</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Até</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Modelo</Label>
                <Select value={modelo} onValueChange={(v: any) => setModelo(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todos (55 + 65)</SelectItem>
                    <SelectItem value="65">NFC-e (65)</SelectItem>
                    <SelectItem value="55">NF-e (55)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={statusFiltro} onValueChange={(v: any) => setStatusFiltro(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Autorizada + Cancelada</SelectItem>
                    <SelectItem value="autorizada">Somente autorizadas</SelectItem>
                    <SelectItem value="cancelada">Somente canceladas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Série</Label>
                <Select value={serie} onValueChange={setSerie}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas</SelectItem>
                    {seriesDisponiveis.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-end">
                <Button onClick={generate} disabled={loading} className="w-full">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
                  Gerar
                </Button>
              </div>
            </div>
            {progress && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" />
                Baixando XML autorizado da SEFAZ: {progress.done}/{progress.total}
              </div>
            )}
          </CardContent>
        </Card>

        {generatedAt && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
              <div>
                <CardTitle className="text-base">Resultado</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  {filteredRows.length} nota(s) • Gerado em {format(generatedAt, 'dd/MM/yyyy HH:mm')}
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={exportPDF} disabled={!filteredRows.length}>
                  <FileText className="w-4 h-4 mr-2" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filteredRows.length}>
                  <FileSpreadsheet className="w-4 h-4 mr-2" /> Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Autorizadas</div>
                  <div className="text-lg font-semibold">{totals.qtdAut}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Valor autorizadas</div>
                  <div className="text-lg font-semibold text-emerald-600">{fmtMoney(totals.somaAut)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Canceladas</div>
                  <div className="text-lg font-semibold">{totals.qtdCanc}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Valor canceladas</div>
                  <div className="text-lg font-semibold text-destructive">{fmtMoney(totals.somaCanc)}</div>
                </div>
              </div>

              {(totals.porCfop.size > 0 || totals.porPag.size > 0) && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded-lg p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Por CFOP (valor autorizado)</div>
                    <div className="space-y-1 text-sm">
                      {Array.from(totals.porCfop.entries()).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span className="font-mono">{k}</span>
                          <span>{v.qtd} nota(s) • <strong>{fmtMoney(v.valor)}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="border rounded-lg p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-2">Por forma de pagamento (valor autorizado)</div>
                    <div className="space-y-1 text-sm">
                      {Array.from(totals.porPag.entries()).map(([k, v]) => (
                        <div key={k} className="flex justify-between">
                          <span>{k}</span>
                          <span>{v.qtd} nota(s) • <strong>{fmtMoney(v.valor)}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              <div className="border rounded-lg overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Data</TableHead>
                      <TableHead className="w-16">Mod.</TableHead>
                      <TableHead className="w-20">Nº</TableHead>
                      <TableHead className="w-16">Sér.</TableHead>
                      <TableHead>Chave de Acesso</TableHead>
                      <TableHead className="w-24">CFOP</TableHead>
                      <TableHead>Natureza</TableHead>
                      <TableHead className="w-32">Pagamento</TableHead>
                      <TableHead className="w-28 text-right">Valor</TableHead>
                      <TableHead className="w-24">Status</TableHead>
                      <TableHead className="w-20">Fonte</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredRows.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center text-muted-foreground py-6">
                          Nenhuma nota encontrada para o filtro escolhido.
                        </TableCell>
                      </TableRow>
                    ) : filteredRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs">{format(new Date(r.dataEmissao), 'dd/MM/yyyy HH:mm')}</TableCell>
                        <TableCell><Badge variant="outline">{r.modelo}</Badge></TableCell>
                        <TableCell className="font-mono text-xs">{r.numero}</TableCell>
                        <TableCell className="font-mono text-xs">{r.serie}</TableCell>
                        <TableCell className="font-mono text-[10px] break-all">
                          <div className="flex items-center gap-1">
                            <span>{r.chave || '—'}</span>
                            {r.chave && (
                              <button
                                type="button"
                                className="text-primary hover:underline text-[10px]"
                                onClick={() => {
                                  navigator.clipboard.writeText(r.chave);
                                  toast.success('Chave copiada');
                                }}
                              >
                                copiar
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{r.cfop}</TableCell>
                        <TableCell className="text-xs">{r.natureza}</TableCell>
                        <TableCell className="text-xs">{r.pagamento}</TableCell>
                        <TableCell className="text-right font-medium">{fmtMoney(r.valor)}</TableCell>
                        <TableCell>
                          <Badge variant={r.status === 'autorizada' ? 'default' : 'destructive'}>
                            {r.status === 'autorizada' ? 'Autorizada' : 'Cancelada'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={r.fonte === 'XML' ? 'default' : 'outline'} className={r.fonte === 'XML' ? 'bg-emerald-600 hover:bg-emerald-600' : ''}>
                            {r.fonte}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}