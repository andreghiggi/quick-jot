import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { fetchCampaignMessages, CampaignMessage, SalesCampaign } from '@/hooks/useSalesCampaigns';
import { Loader2, Download } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  campaignId: string;
  campaign: SalesCampaign | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Aguardando', sent: 'Enviado', failed: 'Falhou', skipped: 'Pulado',
};

export function CampaignReportDialog({ open, onOpenChange, campaignId, campaign }: Props) {
  const [messages, setMessages] = useState<CampaignMessage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetchCampaignMessages(campaignId).then(m => { setMessages(m); setLoading(false); });
  }, [open, campaignId]);

  const total = campaign?.total_recipients || messages.length;
  const sent = messages.filter(m => m.status === 'sent').length;
  const failed = messages.filter(m => m.status === 'failed').length;
  const skipped = messages.filter(m => m.status === 'skipped').length;
  const pct = total > 0 ? ((sent / total) * 100).toFixed(1) : '0';

  function exportCSV() {
    const header = ['Nome', 'Telefone', 'Status', 'Variação', 'Horário do envio', 'Erro'];
    const lines = messages.map(m => [
      m.customer_name, m.customer_phone || '',
      STATUS_LABEL[m.status] || m.status,
      m.variation || '',
      m.sent_at ? new Date(m.sent_at).toLocaleString('pt-BR') : '',
      (m.error_message || '').replace(/[\r\n]+/g, ' '),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
    const csv = [header.join(','), ...lines].join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `campanha_${campaignId.slice(0, 8)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Relatório — {campaign?.name}</DialogTitle>
        </DialogHeader>
        {loading ? <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div> : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Stat label="Total na base" value={total} />
              <Stat label="Enviados" value={sent} className="text-primary" />
              <Stat label="Falhas" value={failed} className="text-destructive" />
              <Stat label="Pulados" value={skipped} className="text-muted-foreground" />
              <Stat label="% entrega" value={`${pct}%`} />
            </div>

            <div className="border rounded-md overflow-hidden">
              <div className="max-h-[40vh] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="text-left p-2">Nome</th>
                      <th className="text-left p-2">Telefone</th>
                      <th className="text-left p-2">Status</th>
                      <th className="text-left p-2">Horário</th>
                    </tr>
                  </thead>
                  <tbody>
                    {messages.map(m => (
                      <tr key={m.id} className="border-t">
                        <td className="p-2">{m.customer_name}</td>
                        <td className="p-2">{m.customer_phone || '—'}</td>
                        <td className="p-2">
                          <Badge variant={m.status === 'sent' ? 'default' : m.status === 'failed' ? 'destructive' : 'outline'}>
                            {STATUS_LABEL[m.status] || m.status}
                          </Badge>
                        </td>
                        <td className="p-2 text-muted-foreground">
                          {m.sent_at ? new Date(m.sent_at).toLocaleString('pt-BR') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={exportCSV} disabled={!messages.length}>
            <Download className="w-4 h-4 mr-2" /> Exportar CSV
          </Button>
          <Button onClick={() => onOpenChange(false)}>Fechar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value, className }: { label: string; value: any; className?: string }) {
  return (
    <div className="border rounded-md p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold ${className || ''}`}>{value}</div>
    </div>
  );
}
