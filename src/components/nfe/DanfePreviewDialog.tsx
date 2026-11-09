import { useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { formatCpfCnpj, formatCep } from '@/lib/fiscalPerson';
import { NFE_FREIGHT_MODES } from '@/lib/nfeForm';

const money = (n: any) => (Number(n) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: any) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const dt = (v?: string) => (v ? new Date(v).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '');

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  company: any;
  data: { payload: any; valorProdutos: number; destTipo: 'pj' | 'pf' };
};

/** Espelho do DANFE (pré-visualização) — sem chave/protocolo e sem valor fiscal. */
export function DanfePreviewDialog({ open, onOpenChange, company, data }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const p = data.payload || {};
  const d = p.destinatario || {};
  const e = d.endereco || {};
  const t = p.transporte || {};
  const tr = t.transportadora || {};
  const ve = t.veiculo || {};
  const vol = (t.volumes || [])[0] || {};
  const itens: any[] = p.itens || [];
  const modFrete = (NFE_FREIGHT_MODES as readonly any[]).find((m: any) => m.code === t.modalidade_frete);
  const emitAddr = [company?.address_street, company?.address_number, company?.address_neighborhood].filter(Boolean).join(', ');
  const emitCity = [company?.address_city, company?.address_state].filter(Boolean).join(' - ');
  const icmsTotal = itens.reduce((s, i) => s + (Number(i.quantidade) * Number(i.valor_unitario) * (Number(i.icms_aliquot) || 0)) / 100, 0);
  const info = [p.informacoes_adicionais?.contribuinte, p.informacoes_adicionais?.fisco].filter(Boolean).join('\n');

  function print() {
    const html = ref.current?.innerHTML || '';
    const w = window.open('', '_blank', 'width=900,height=1000');
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Pré-visualização DANFE</title><style>
      body{font-family:Arial,sans-serif;font-size:10px;margin:10mm;color:#000}
      .danfe-box{border:1px solid #000;padding:3px 5px}
      .danfe-grid{display:grid;gap:0}
      .danfe-title{font-weight:bold;font-size:9px;margin:6px 0 2px;text-transform:uppercase}
      .danfe-label{font-size:7px;text-transform:uppercase}
      .danfe-val{font-size:10px;font-weight:bold;min-height:12px}
      table{width:100%;border-collapse:collapse}th,td{border:1px solid #000;padding:2px 3px;font-size:8px}
      .danfe-watermark{position:fixed;top:40%;left:0;right:0;text-align:center;font-size:72px;font-weight:bold;opacity:.12;transform:rotate(-25deg)}
      .danfe-banner{text-align:center;font-weight:bold;font-size:14px;border:2px solid #000;padding:4px;margin-bottom:6px}
      </style></head><body>${html}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
  }

  const cell = (label: string, value: any, span = 1) => (
    <div className="danfe-box border border-foreground px-1.5 py-0.5" style={{ gridColumn: `span ${span}` }}>
      <div className="danfe-label text-[8px] uppercase text-muted-foreground">{label}</div>
      <div className="danfe-val text-xs font-semibold min-h-[14px]">{value || ''}</div>
    </div>
  );
  const grid = (cols: number, children: any) => (
    <div className="danfe-grid grid" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>{children}</div>
  );
  const title = (s: string) => <div className="danfe-title text-[10px] font-bold uppercase mt-3 mb-1">{s}</div>;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
          <div>
            <DialogTitle>Pré-visualização do DANFE</DialogTitle>
            <DialogDescription>Confira os dados antes de transmitir. Nada é enviado à SEFAZ.</DialogDescription>
          </div>
          <Button variant="outline" size="sm" onClick={print}><Printer className="w-4 h-4 mr-1" /> Imprimir / PDF</Button>
        </DialogHeader>

        <div ref={ref} className="relative bg-card text-card-foreground p-4 border rounded-md overflow-hidden">
          <div className="danfe-watermark pointer-events-none absolute inset-0 flex items-center justify-center text-7xl font-black text-muted-foreground/15 -rotate-[25deg] select-none">
            PRÉ-VISUALIZAÇÃO
          </div>
          <div className="danfe-banner text-center font-bold text-sm border-2 border-foreground py-1 mb-2">PRÉ-VISUALIZAÇÃO</div>

          {grid(6, <>
            <div className="danfe-box border border-foreground p-2" style={{ gridColumn: 'span 3' }}>
              <div className="font-bold text-sm">{company?.razao_social || company?.name}</div>
              <div className="text-xs">{emitAddr}</div>
              <div className="text-xs">{emitCity} {company?.address_cep ? `· CEP ${formatCep(company.address_cep)}` : ''}</div>
              <div className="text-xs">{company?.phone ? `Fone: ${company.phone}` : ''}</div>
            </div>
            <div className="danfe-box border border-foreground p-2 text-center" style={{ gridColumn: 'span 1' }}>
              <div className="font-bold text-base">DANFE</div>
              <div className="text-[9px]">Documento Auxiliar da Nota Fiscal Eletrônica</div>
              <div className="text-[9px] mt-1">1 - SAÍDA</div>
              <div className="text-[10px] font-bold mt-1">Nº a definir</div>
              <div className="text-[10px]">Série {p.serie}</div>
            </div>
            <div className="danfe-box border border-foreground p-2" style={{ gridColumn: 'span 2' }}>
              <div className="danfe-label text-[8px] uppercase text-muted-foreground">Chave de acesso</div>
              <div className="text-xs font-mono">Gerada na autorização</div>
              <div className="danfe-label text-[8px] uppercase text-muted-foreground mt-2">Ambiente</div>
              <div className="text-xs font-semibold">{p.ambiente === 'producao' ? 'Produção' : 'Homologação'}</div>
            </div>
          </>)}
          {grid(4, <>
            {cell('Natureza da operação', p.natureza_operacao, 2)}
            {cell('Protocolo de autorização', 'Após transmissão', 2)}
            {cell('Inscrição estadual', '', 1)}
            {cell('CNPJ', formatCpfCnpj(company?.cnpj), 1)}
            {cell('Data de emissão', dt(p.data_emissao), 1)}
            {cell('Data saída/entrada', dt(p.data_saida_entrada), 1)}
          </>)}

          {title('Destinatário / Remetente')}
          {grid(6, <>
            {cell('Nome / Razão social', d.razao_social, 4)}
            {cell('CNPJ / CPF', formatCpfCnpj(d.cnpj || d.cpf), 2)}
            {cell('Endereço', [e.logradouro, e.numero, e.complemento].filter(Boolean).join(', '), 3)}
            {cell('Bairro', e.bairro, 2)}
            {cell('CEP', formatCep(e.cep), 1)}
            {cell('Município', e.municipio, 2)}
            {cell('Cód. IBGE', e.codigo_municipio, 1)}
            {cell('UF', e.uf, 1)}
            {cell('Fone', d.telefone, 1)}
            {cell('Inscrição estadual', d.inscricao_estadual || (d.indIEDest === '2' ? 'ISENTO' : ''), 1)}
          </>)}

          {title('Cálculo do imposto')}
          {grid(6, <>
            {cell('Base de cálculo ICMS', money(icmsTotal ? data.valorProdutos : 0))}
            {cell('Valor do ICMS', money(icmsTotal))}
            {cell('Valor total dos produtos', money(data.valorProdutos))}
            {cell('Valor do frete', money(p.valor_frete))}
            {cell('Desconto', money(0))}
            {cell('Valor total da nota', money(p.valor_total))}
          </>)}

          {title('Transportador / Volumes transportados')}
          {grid(6, <>
            {cell('Razão social', tr.razao_social, 2)}
            {cell('Frete por conta', modFrete ? modFrete.label : t.modalidade_frete, 1)}
            {cell('Placa / UF', [ve.placa, ve.uf].filter(Boolean).join(' / '), 1)}
            {cell('CNPJ / CPF', formatCpfCnpj(tr.documento), 1)}
            {cell('Inscrição estadual', tr.ie, 1)}
            {cell('Endereço', tr.endereco, 3)}
            {cell('Município', tr.municipio, 2)}
            {cell('UF', tr.uf, 1)}
            {cell('Quantidade', vol.quantidade)}
            {cell('Espécie', vol.especie)}
            {cell('Marca', vol.marca)}
            {cell('Numeração', vol.numeracao)}
            {cell('Peso bruto', vol.peso_bruto)}
            {cell('Peso líquido', vol.peso_liquido)}
          </>)}

          {title('Dados dos produtos / serviços')}
          <table className="w-full text-[10px] border-collapse">
            <thead>
              <tr>
                {['Descrição', 'NCM', 'CSOSN', 'CFOP', 'UN', 'Qtd', 'V. Unit.', 'V. Total', '% ICMS'].map(h =>
                  <th key={h} className="border border-foreground px-1 py-0.5 text-left">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {itens.length === 0 && <tr><td colSpan={9} className="border border-foreground px-1 py-2 text-center">Nenhum item</td></tr>}
              {itens.map((i, idx) => (
                <tr key={idx}>
                  <td className="border border-foreground px-1">{i.descricao}</td>
                  <td className="border border-foreground px-1">{i.ncm}</td>
                  <td className="border border-foreground px-1">{i.csosn}</td>
                  <td className="border border-foreground px-1">{i.cfop}</td>
                  <td className="border border-foreground px-1">{i.unidade}</td>
                  <td className="border border-foreground px-1 text-right">{qty(i.quantidade)}</td>
                  <td className="border border-foreground px-1 text-right">{money(i.valor_unitario)}</td>
                  <td className="border border-foreground px-1 text-right">{money(Number(i.quantidade) * Number(i.valor_unitario))}</td>
                  <td className="border border-foreground px-1 text-right">{money(i.icms_aliquot)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {title('Dados adicionais')}
          {grid(3, <>
            <div className="danfe-box border border-foreground p-1.5 whitespace-pre-wrap text-xs min-h-[60px]" style={{ gridColumn: 'span 2' }}>
              <div className="danfe-label text-[8px] uppercase text-muted-foreground">Informações complementares</div>
              {info}
              {p.informacoes_adicionais?.numero_pedido ? `\nPedido: ${p.informacoes_adicionais.numero_pedido}` : ''}
            </div>
            <div className="danfe-box border border-foreground p-1.5 text-xs">
              <div className="danfe-label text-[8px] uppercase text-muted-foreground">Reservado ao fisco</div>
            </div>
          </>)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
