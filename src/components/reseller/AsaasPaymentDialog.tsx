import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Copy, ExternalLink, FileText, QrCode, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export interface AsaasChargeData {
  invoice_id: string;
  charge_id: string | null;
  invoice_url: string | null;
  pix_qrcode: string | null;
  pix_payload: string | null;
  pix_error?: string | null;
  boleto_url: string | null;
  status: string | null;
  value: number;
  due_date: string;
}

interface Props {
  charge: AsaasChargeData | null;
  onClose: () => void;
  onUpdated?: () => void;
}

export function AsaasPaymentDialog({ charge, onClose, onUpdated }: Props) {
  const [syncing, setSyncing] = useState(false);

  if (!charge) return null;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  async function handleSync() {
    if (!charge?.invoice_id) return;
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke('asaas-billing', {
        body: { action: 'sync_status', invoice_id: charge.invoice_id },
      });
      if (error) throw error;
      if (data?.status === 'RECEIVED' || data?.status === 'CONFIRMED') {
        toast.success('Pagamento confirmado!');
        onUpdated?.();
        onClose();
      } else {
        toast.info(`Status atual: ${data?.status || 'PENDING'}`);
      }
    } catch (err: any) {
      toast.error('Erro ao sincronizar: ' + err.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Dialog open={!!charge} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Pagamento via Asaas</DialogTitle>
          <DialogDescription>
            Valor: <strong>R$ {charge.value.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</strong>
            {' · '}Vencimento: {new Date(charge.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue={charge.pix_qrcode ? 'pix' : 'boleto'}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="pix" disabled={!charge.pix_qrcode}>
              <QrCode className="w-4 h-4 mr-2" /> PIX
            </TabsTrigger>
            <TabsTrigger value="boleto" disabled={!charge.boleto_url && !charge.invoice_url}>
              <FileText className="w-4 h-4 mr-2" /> Boleto
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pix" className="space-y-3">
            {charge.pix_qrcode ? (
              <div className="flex justify-center bg-white p-4 rounded-md border">
                <img
                  src={`data:image/png;base64,${charge.pix_qrcode}`}
                  alt="QR Code PIX"
                  className="w-56 h-56"
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">
                QR Code PIX não disponível.
              </p>
            )}
            {charge.pix_payload && (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">PIX Copia e Cola:</p>
                <div className="bg-muted p-2 rounded text-xs font-mono break-all max-h-24 overflow-y-auto">
                  {charge.pix_payload}
                </div>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => copy(charge.pix_payload!, 'Código PIX')}
                >
                  <Copy className="w-4 h-4 mr-2" /> Copiar código PIX
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="boleto" className="space-y-3">
            {charge.boleto_url && (
              <Button
                variant="default"
                className="w-full"
                onClick={() => window.open(charge.boleto_url!, '_blank')}
              >
                <FileText className="w-4 h-4 mr-2" /> Abrir Boleto (PDF)
              </Button>
            )}
            {charge.invoice_url && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => window.open(charge.invoice_url!, '_blank')}
              >
                <ExternalLink className="w-4 h-4 mr-2" /> Página da Cobrança
              </Button>
            )}
          </TabsContent>
        </Tabs>

        <Button variant="ghost" onClick={handleSync} disabled={syncing}>
          {syncing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          Verificar pagamento
        </Button>
      </DialogContent>
    </Dialog>
  );
}
