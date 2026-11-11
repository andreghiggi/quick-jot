import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import { toast } from 'sonner';
import { nfeDanfeHtml, openNfeDanfe } from '@/lib/nfeDanfe';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  company: any;
  data: { payload: any; valorProdutos: number; destTipo: 'pj' | 'pf' };
};

export function DanfePreviewDialog({ open, onOpenChange, company, data }: Props) {
  const html = nfeDanfeHtml(company || {}, data.payload || {});
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[85dvh] flex flex-col" aria-describedby={undefined}>
        <DialogHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pr-5">
          <DialogTitle>Pré-visualização do DANFE</DialogTitle>
          <Button variant="outline" size="sm" onClick={() => {
            try { openNfeDanfe(html, true); } catch (e) { toast.error(e instanceof Error ? e.message : 'Não foi possível abrir o DANFE.'); }
          }}><Printer className="w-4 h-4 mr-1" /> Imprimir / PDF</Button>
        </DialogHeader>
        <div className="overflow-auto min-h-0 border bg-muted p-2" tabIndex={0} aria-label="DANFE A4">
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
