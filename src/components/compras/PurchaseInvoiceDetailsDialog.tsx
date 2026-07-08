import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cfopSaidaParaEntrada } from '@/utils/cfopSaidaEntrada';

type Item = {
  id: string;
  xml_codigo: string | null;
  xml_descricao: string | null;
  xml_ean: string | null;
  xml_ncm: string | null;
  xml_cfop: string | null;
  xml_unidade: string | null;
  quantidade: number | null;
  valor_unitario: number | null;
  valor_total: number | null;
  stock_applied: boolean | null;
};

type Invoice = {
  id: string;
  chave_acesso: string | null;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  numero_nfe: string | null;
  serie: string | null;
  data_emissao: string | null;
  valor_total: number | null;
  natureza_operacao?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  invoice: Invoice | null;
}

const brl = (v: any) =>
  Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export function PurchaseInvoiceDetailsDialog({ open, onOpenChange, invoice }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !invoice?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('purchase_invoice_items')
        .select('*')
        .eq('invoice_id', invoice.id)
        .order('created_at', { ascending: true });
      if (!cancelled) {
        setItems((data as any) || []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, invoice?.id]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>
            NF-e {invoice?.numero_nfe} · série {invoice?.serie}
          </DialogTitle>
          <DialogDescription>
            {invoice?.nome_emitente} · CNPJ {invoice?.cnpj_emitente}
          </DialogDescription>
        </DialogHeader>

        <div className="text-xs text-muted-foreground space-y-1 pb-2 border-b">
          <div>
            <strong>Chave:</strong>{' '}
            <span className="font-mono">{invoice?.chave_acesso}</span>
          </div>
          <div className="flex flex-wrap gap-x-4">
            <span>
              <strong>Emissão:</strong>{' '}
              {invoice?.data_emissao
                ? new Date(invoice.data_emissao).toLocaleString('pt-BR', {
                    timeZone: 'America/Sao_Paulo',
                  })
                : '—'}
            </span>
            {invoice?.natureza_operacao && (
              <span>
                <strong>Natureza:</strong> {invoice.natureza_operacao}
              </span>
            )}
            <span>
              <strong>Total:</strong>{' '}
              <span className="text-emerald-600 font-semibold">
                {brl(invoice?.valor_total)}
              </span>
            </span>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center text-muted-foreground py-16 text-sm">
              Nenhum item encontrado.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-muted">
                <tr className="text-left">
                  <th className="p-2">#</th>
                  <th className="p-2">Código</th>
                  <th className="p-2">Descrição</th>
                  <th className="p-2">NCM</th>
                  <th className="p-2">CFOP saída</th>
                  <th className="p-2">CFOP entrada</th>
                  <th className="p-2">Un</th>
                  <th className="p-2 text-right">Qtd</th>
                  <th className="p-2 text-right">Vl. Unit.</th>
                  <th className="p-2 text-right">Vl. Total</th>
                  <th className="p-2">Estoque</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => {
                  const cfopEntrada = cfopSaidaParaEntrada(it.xml_cfop);
                  return (
                    <tr key={it.id} className="border-b hover:bg-muted/40">
                      <td className="p-2 text-muted-foreground">{i + 1}</td>
                      <td className="p-2 font-mono">{it.xml_codigo || '—'}</td>
                      <td className="p-2">
                        <div>{it.xml_descricao}</div>
                        {it.xml_ean && it.xml_ean !== 'SEM GTIN' && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            EAN {it.xml_ean}
                          </div>
                        )}
                      </td>
                      <td className="p-2 font-mono">{it.xml_ncm || '—'}</td>
                      <td className="p-2 font-mono text-muted-foreground">
                        {it.xml_cfop || '—'}
                      </td>
                      <td className="p-2 font-mono">
                        {cfopEntrada ? (
                          <Badge
                            variant="outline"
                            className="bg-blue-500/10 text-blue-700 border-blue-500/30 font-mono"
                          >
                            {cfopEntrada}
                          </Badge>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="p-2">{it.xml_unidade || '—'}</td>
                      <td className="p-2 text-right">
                        {Number(it.quantidade || 0).toLocaleString('pt-BR', {
                          maximumFractionDigits: 4,
                        })}
                      </td>
                      <td className="p-2 text-right">{brl(it.valor_unitario)}</td>
                      <td className="p-2 text-right font-medium">
                        {brl(it.valor_total)}
                      </td>
                      <td className="p-2">
                        {it.stock_applied ? (
                          <Badge
                            variant="outline"
                            className="bg-emerald-500/10 text-emerald-700 border-emerald-500/30"
                          >
                            aplicado
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            —
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="text-[11px] text-muted-foreground pt-2 border-t">
          O <strong>CFOP de entrada</strong> é derivado do CFOP de saída do XML
          (prefixo 5→1, 6→2, 7→3) e aplicado ao cadastro do produto no momento do
          lançamento.
        </div>
      </DialogContent>
    </Dialog>
  );
}