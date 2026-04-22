import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle, Receipt, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  consultarNFCe,
  reprocessarNFCe,
  printDanfeFromRecord,
  NFCeRecord,
} from '@/services/nfceService';

interface PDVV2NFCePostSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  /** Registro inicial da NFC-e (vem do nfce_records logo após emitir) */
  initialRecord: NFCeRecord | null;
  /** Imprimir DANFE automaticamente assim que autorizada */
  autoPrint: boolean;
  /** Callback quando o operador fechar o diálogo (sucesso ou rejeitada) */
  onClosed?: () => void;
}

/**
 * Diálogo pós-venda de NFC-e para o PDV V2.
 * Replica o comportamento do PDV V1: faz polling na SEFAZ até autorizar/rejeitar
 * e exibe ao operador a opção de imprimir o DANFE manualmente (ou imprime
 * automaticamente, se solicitado).
 */
export function PDVV2NFCePostSaleDialog({
  open,
  onOpenChange,
  companyId,
  initialRecord,
  autoPrint,
  onClosed,
}: PDVV2NFCePostSaleDialogProps) {
  const [record, setRecord] = useState<NFCeRecord | null>(initialRecord);
  const [status, setStatus] = useState<string>(initialRecord?.status || 'processando');
  const [polling, setPolling] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [countdown, setCountdown] = useState(10);
  const [autoPrinted, setAutoPrinted] = useState(false);

  // Sincroniza estado interno com o registro inicial sempre que o pop-up abrir
  useEffect(() => {
    if (open) {
      setRecord(initialRecord);
      setStatus(initialRecord?.status || 'processando');
      setRetryCount(0);
      setAutoPrinted(false);
    }
  }, [open, initialRecord]);

  // Auto-print quando o status já vem autorizado na primeira abertura
  useEffect(() => {
    if (!open || !record || autoPrinted) return;
    if (status === 'autorizada' && autoPrint) {
      setAutoPrinted(true);
      printDanfeFromRecord(record)
        .then(() => toast.success('DANFE impressa automaticamente'))
        .catch((e: any) => toast.error(e?.message || 'Erro ao imprimir DANFE'));
    }
  }, [open, status, record, autoPrint, autoPrinted]);

  // Polling para acompanhar status na SEFAZ
  useEffect(() => {
    if (!open || !record) return;
    if (status !== 'processando' && status !== 'pendente') return;

    setPolling(true);
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      const shouldConsultApi = pollCount <= 2 || pollCount % 2 === 0;

      if (shouldConsultApi && record.nfce_id && companyId) {
        try {
          await consultarNFCe(companyId, record.nfce_id);
        } catch (e) {
          console.error('[PDVV2 NFC-e] consult error:', e);
        }
      }

      const { data } = await supabase
        .from('nfce_records')
        .select('*')
        .eq('id', record.id)
        .maybeSingle();

      if (!data) return;
      setRecord(data as unknown as NFCeRecord);
      const newStatus = data.status || 'processando';

      // Auto-retry uma vez se rejeitada
      if ((newStatus === 'rejeitada' || newStatus === 'erro') && retryCount < 1) {
        setRetryCount((c) => c + 1);
        setStatus('processando');
        toast.info('NFC-e rejeitada, tentando reenviar automaticamente...');
        try {
          if (data.nfce_id && companyId) {
            await reprocessarNFCe(companyId, data.nfce_id);
          }
        } catch (e) {
          console.error('[PDVV2 NFC-e] retry error:', e);
        }
        return;
      }

      setStatus(newStatus);
      if (newStatus === 'autorizada' || newStatus === 'rejeitada' || newStatus === 'erro') {
        setPolling(false);
        clearInterval(interval);

        if (newStatus === 'autorizada' && autoPrint && !autoPrinted) {
          setAutoPrinted(true);
          try {
            await printDanfeFromRecord(data as unknown as NFCeRecord);
            toast.success('DANFE impressa automaticamente');
          } catch (e: any) {
            toast.error(e?.message || 'Erro ao imprimir DANFE');
          }
        }

        if (newStatus === 'rejeitada' || newStatus === 'erro') {
          toast.error(
            `NFC-e ${newStatus}: ${data.motivo_rejeicao || 'Verifique no Monitor NFC-e'}`,
          );
        }
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [open, record, status, retryCount, companyId, autoPrint, autoPrinted]);

  // Countdown para fechar automaticamente após resolução
  useEffect(() => {
    if (!open) return;
    if (status === 'processando' || status === 'pendente') return;
    const autoHandled = status === 'autorizada' && autoPrint;
    setCountdown(autoHandled ? 3 : 10);
    const t = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(t);
          onOpenChange(false);
          onClosed?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [open, status, autoPrint, onOpenChange, onClosed]);

  function close() {
    onOpenChange(false);
    onClosed?.();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) close();
      }}
    >
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            NFC-e
            {record?.numero ? ` nº ${record.numero}` : ''} —{' '}
            {status === 'autorizada'
              ? 'Autorizada'
              : status === 'rejeitada'
              ? 'Rejeitada'
              : 'Processando...'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-center">
          {polling || status === 'processando' || status === 'pendente' ? (
            <div className="flex flex-col items-center gap-3 py-4">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Aguardando retorno da SEFAZ...</p>
            </div>
          ) : status === 'autorizada' ? (
            autoPrint ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
                <p className="text-sm text-muted-foreground">
                  ✅ NFC-e{record?.numero ? ` nº ${record.numero}` : ''} autorizada! DANFE
                  impressa automaticamente.
                </p>
                <p className="text-xs text-muted-foreground">Fechando em {countdown}s...</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  ✅ NFC-e{record?.numero ? ` nº ${record.numero}` : ''} autorizada com sucesso!
                  Deseja imprimir o DANFE?
                </p>
                <div className="flex gap-3 justify-center">
                  <Button variant="outline" onClick={close}>
                    Não ({countdown}s)
                  </Button>
                  <Button
                    onClick={async () => {
                      if (!record) return;
                      setPrinting(true);
                      try {
                        await printDanfeFromRecord(record);
                        toast.success('DANFE enviada para impressão');
                      } catch (e: any) {
                        toast.error(e?.message || 'Erro ao imprimir DANFE');
                      } finally {
                        setPrinting(false);
                        close();
                      }
                    }}
                    disabled={printing}
                    className="gap-2"
                  >
                    {printing ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Printer className="w-4 h-4" />
                    )}
                    Imprimir DANFE
                  </Button>
                </div>
              </>
            )
          ) : (
            <>
              <p className="text-sm text-destructive">
                ❌ NFC-e {status === 'rejeitada' ? 'rejeitada' : 'com erro'}. Verifique no
                Monitor NFC-e.
              </p>
              <Button variant="outline" onClick={close}>
                Fechar ({countdown}s)
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
