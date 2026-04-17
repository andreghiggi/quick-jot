import { useEffect, useMemo, useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuthContext } from '@/contexts/AuthContext';
import { useCompanyModules } from '@/hooks/useCompanyModules';
import { Navigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Plus, Play, Pause, X, FileDown, Loader2, Trash2 } from 'lucide-react';
import { useSalesCampaigns, SalesCampaign, fetchCampaignMessages, CampaignMessage } from '@/hooks/useSalesCampaigns';
import { NewCampaignDialog } from '@/components/campaigns/NewCampaignDialog';
import { CampaignReportDialog } from '@/components/campaigns/CampaignReportDialog';
import { supabase } from '@/integrations/supabase/client';

const STATUS_LABEL: Record<SalesCampaign['status'], string> = {
  pending: 'Aguardando', running: 'Em andamento', paused: 'Pausada', completed: 'Concluída', canceled: 'Cancelada',
};
const STATUS_VARIANT: Record<SalesCampaign['status'], 'default' | 'secondary' | 'outline' | 'destructive'> = {
  pending: 'outline', running: 'default', paused: 'secondary', completed: 'secondary', canceled: 'destructive',
};

export default function SalesCampaigns() {
  const { company } = useAuthContext();
  const { isModuleEnabled, loading: modulesLoading } = useCompanyModules({ companyId: company?.id });
  const { campaigns, loading, createCampaign, setStatus, deleteCampaign } = useSalesCampaigns(company?.id);
  const [openNew, setOpenNew] = useState(false);
  const [reportId, setReportId] = useState<string | null>(null);
  const [intervalSec, setIntervalSec] = useState(60);

  useEffect(() => {
    supabase.from('campaign_settings').select('interval_seconds').limit(1).maybeSingle()
      .then(({ data }) => { if (data) setIntervalSec(data.interval_seconds); });
  }, []);

  if (modulesLoading) return <AppLayout><div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div></AppLayout>;
  if (!isModuleEnabled('sales_campaigns')) return <Navigate to="/" replace />;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold">Campanhas de Vendas</h1>
            <p className="text-muted-foreground text-sm">Envie mensagens em massa para sua base de clientes via WhatsApp.</p>
          </div>
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="w-4 h-4 mr-2" /> Nova Campanha
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center p-10"><Loader2 className="animate-spin" /></div>
        ) : campaigns.length === 0 ? (
          <Card><CardContent className="p-10 text-center text-muted-foreground">
            Nenhuma campanha criada ainda. Clique em "Nova Campanha" para começar.
          </CardContent></Card>
        ) : (
          <div className="grid gap-4">
            {campaigns.map(c => (
              <CampaignCard key={c.id} campaign={c} intervalSec={intervalSec}
                onStart={() => setStatus(c.id, 'running')}
                onPause={() => setStatus(c.id, 'paused')}
                onResume={() => setStatus(c.id, 'running')}
                onCancel={() => setStatus(c.id, 'canceled')}
                onDelete={() => deleteCampaign(c.id)}
                onReport={() => setReportId(c.id)}
              />
            ))}
          </div>
        )}
      </div>

      <NewCampaignDialog
        open={openNew} onOpenChange={setOpenNew}
        company={company}
        onCreate={async (input) => {
          const c = await createCampaign(input);
          if (c) setOpenNew(false);
        }}
      />
      {reportId && (
        <CampaignReportDialog
          campaignId={reportId}
          campaign={campaigns.find(c => c.id === reportId) || null}
          open={!!reportId}
          onOpenChange={(o) => !o && setReportId(null)}
        />
      )}
    </AppLayout>
  );
}

function CampaignCard({ campaign, intervalSec, onStart, onPause, onResume, onCancel, onDelete, onReport }: {
  campaign: SalesCampaign; intervalSec: number;
  onStart: () => void; onPause: () => void; onResume: () => void; onCancel: () => void; onDelete: () => void; onReport: () => void;
}) {
  const total = campaign.total_recipients;
  const processed = campaign.sent_count + campaign.failed_count + campaign.skipped_count;
  const pct = total > 0 ? Math.round((processed / total) * 100) : 0;
  const remaining = Math.max(total - processed, 0);
  const etaMin = Math.ceil((remaining * intervalSec) / 60);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <CardTitle className="text-lg">{campaign.name}</CardTitle>
            <div className="text-xs text-muted-foreground mt-1">
              Criada em {new Date(campaign.created_at).toLocaleString('pt-BR')}
            </div>
          </div>
          <Badge variant={STATUS_VARIANT[campaign.status]}>{STATUS_LABEL[campaign.status]}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Progress value={pct} />
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
          <span><strong>{processed}</strong> de <strong>{total}</strong> processados ({pct}%)</span>
          <span className="text-primary">✓ {campaign.sent_count} enviados</span>
          <span className="text-destructive">✗ {campaign.failed_count} falhas</span>
          <span className="text-muted-foreground">⊘ {campaign.skipped_count} pulados</span>
          {campaign.status === 'running' && remaining > 0 && (
            <span className="text-muted-foreground">⏱ ~{etaMin} min restantes</span>
          )}
        </div>

        <div className="flex flex-wrap gap-2 pt-2">
          {(campaign.status === 'pending') && (
            <Button size="sm" onClick={onStart}><Play className="w-4 h-4 mr-1" /> Iniciar Campanha</Button>
          )}
          {campaign.status === 'running' && (
            <Button size="sm" variant="outline" onClick={onPause}><Pause className="w-4 h-4 mr-1" /> Pausar</Button>
          )}
          {campaign.status === 'paused' && (
            <Button size="sm" onClick={onResume}><Play className="w-4 h-4 mr-1" /> Retomar</Button>
          )}
          {(campaign.status === 'running' || campaign.status === 'paused' || campaign.status === 'pending') && (
            <Button size="sm" variant="outline" onClick={onCancel}><X className="w-4 h-4 mr-1" /> Cancelar</Button>
          )}
          <Button size="sm" variant="ghost" onClick={onReport}><FileDown className="w-4 h-4 mr-1" /> Relatório</Button>
          {(campaign.status === 'completed' || campaign.status === 'canceled') && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDelete}>
              <Trash2 className="w-4 h-4 mr-1" /> Excluir
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
