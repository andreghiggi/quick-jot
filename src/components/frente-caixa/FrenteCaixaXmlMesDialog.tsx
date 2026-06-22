import { useMemo, useState } from 'react';
import { Loader2, FileArchive, Download } from 'lucide-react';
import { toast } from 'sonner';
import JSZip from 'jszip';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  companyId: string;
  companyName?: string;
  /**
   * Fonte dos XMLs:
   * - 'nfce' (default): NFC-e autorizadas (tabela `nfce_records`, `xml_url` público)
   * - 'compras': NF-e de entrada importadas (`purchase_invoices`, `xml_path` no bucket `dfe-xmls`)
   */
  source?: 'nfce' | 'compras';
}

const MONTHS = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

/**
 * Dialog para baixar todos os XMLs autorizados do mês em um arquivo .zip.
 * Lê `nfce_records` filtrando por company_id, status='autorizada' e o intervalo
 * de datas (America/Sao_Paulo). Faz download direto via `xml_url` quando
 * disponível e empacota com JSZip.
 */
export function FrenteCaixaXmlMesDialog({ open, onOpenChange, companyId, companyName, source = 'nfce' }: Props) {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [month, setMonth] = useState<number>(now.getMonth() + 1); // 1-12
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressTotal, setProgressTotal] = useState(0);

  const years = useMemo(() => {
    const arr: number[] = [];
    for (let y = now.getFullYear(); y >= now.getFullYear() - 4; y--) arr.push(y);
    return arr;
  }, [now]);

  const handleDownload = async () => {
    if (!companyId) return;
    setLoading(true);
    setProgress(0);
    setProgressTotal(0);

    try {
      // Intervalo do mês em America/Sao_Paulo (UTC-3)
      const start = new Date(Date.UTC(year, month - 1, 1, 3, 0, 0));
      const end = new Date(Date.UTC(year, month, 1, 3, 0, 0));

      let withXml: Array<{ id: string; baseName: string; xmlPath: string; isStorage: boolean }> = [];

      if (source === 'nfce') {
        const { data: records, error } = await supabase
          .from('nfce_records')
          .select('id, numero, serie, chave_acesso, xml_url, status, created_at')
          .eq('company_id', companyId)
          .eq('status', 'autorizada')
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .order('created_at', { ascending: true });
        if (error) throw error;
        withXml = (records || [])
          .filter((r: any) => !!r.xml_url)
          .map((r: any) => ({
            id: r.id,
            baseName: r.chave_acesso || `nfce-${r.serie ?? 'X'}-${r.numero ?? r.id.slice(0, 8)}`,
            xmlPath: r.xml_url as string,
            isStorage: false,
          }));
      } else {
        const { data: records, error } = await supabase
          .from('purchase_invoices')
          .select('id, chave_acesso, numero_nfe, serie, xml_path, created_at')
          .eq('company_id', companyId)
          .gte('created_at', start.toISOString())
          .lt('created_at', end.toISOString())
          .order('created_at', { ascending: true });
        if (error) throw error;
        withXml = (records || [])
          .filter((r: any) => !!r.xml_path)
          .map((r: any) => ({
            id: r.id,
            baseName: r.chave_acesso || `nfe-${r.serie ?? 'X'}-${r.numero_nfe ?? r.id.slice(0, 8)}`,
            xmlPath: r.xml_path as string,
            isStorage: true,
          }));
      }

      if (withXml.length === 0) {
        toast.warning(
          source === 'compras'
            ? 'Nenhuma NF-e de entrada com XML encontrada no período.'
            : 'Nenhuma NFC-e autorizada com XML encontrada no período.',
        );
        setLoading(false);
        return;
      }

      setProgressTotal(withXml.length);

      const zip = new JSZip();
      const folderName = source === 'compras' ? 'NFe_Entrada' : 'NFCe';
      const folder = zip.folder(`${folderName}_${year}-${String(month).padStart(2, '0')}`)!;

      let okCount = 0;
      let failCount = 0;

      // Limita concorrência simples (4 paralelos)
      const batchSize = 4;
      for (let i = 0; i < withXml.length; i += batchSize) {
        const batch = withXml.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (rec) => {
            try {
              let text: string;
              if (rec.isStorage) {
                const { data: file, error: dlErr } = await supabase.storage
                  .from('dfe-xmls')
                  .download(rec.xmlPath);
                if (dlErr || !file) throw dlErr || new Error('download falhou');
                text = await file.text();
              } else {
                const resp = await fetch(rec.xmlPath);
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                text = await resp.text();
              }
              folder.file(`${rec.baseName}.xml`, text);
              okCount++;
            } catch (err) {
              console.error('[XmlMes] Falha em', rec.id, err);
              failCount++;
            } finally {
              setProgress((p) => p + 1);
            }
          }),
        );
      }

      if (okCount === 0) {
        toast.error('Não foi possível baixar nenhum XML.');
        setLoading(false);
        return;
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const safeName = (companyName || 'loja').replace(/[^a-z0-9]+/gi, '_').toLowerCase();
      const prefix = source === 'compras' ? 'xmls_entrada' : 'xmls';
      const fileName = `${prefix}_${safeName}_${year}-${String(month).padStart(2, '0')}.zip`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      if (failCount > 0) {
        toast.success(`Download iniciado. ${okCount} XMLs incluídos, ${failCount} falharam.`);
      } else {
        toast.success(`Download iniciado. ${okCount} XMLs incluídos.`);
      }
    } catch (err: any) {
      console.error('[XmlMes] erro:', err);
      toast.error(err?.message || 'Falha ao gerar o ZIP.');
    } finally {
      setLoading(false);
    }
  };

  const pct = progressTotal > 0 ? Math.round((progress / progressTotal) * 100) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            XML do mês
          </DialogTitle>
          <DialogDescription>
            {source === 'compras'
              ? <>Baixe um arquivo .zip com todos os XMLs das <strong>NF-e de entrada</strong> importadas no mês selecionado.</>
              : <>Baixe um arquivo .zip com todos os XMLs das NFC-e <strong>autorizadas</strong> do mês selecionado.</>}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3 py-2">
          <div className="space-y-1.5">
            <Label>Mês</Label>
            <Select value={String(month)} onValueChange={(v) => setMonth(Number(v))} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i + 1} value={String(i + 1)}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Ano</Label>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))} disabled={loading}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {years.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loading && progressTotal > 0 && (
          <div className="space-y-2 py-2">
            <div className="text-xs text-muted-foreground">
              Baixando {progress}/{progressTotal} XMLs...
            </div>
            <Progress value={pct} />
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleDownload} disabled={loading} className="gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {loading ? 'Gerando ZIP...' : 'Baixar ZIP'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}