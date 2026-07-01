// ─────────────────────────────────────────────────────────────────────────────
// Frente de Caixa › Pós-venda CONSOLIDADO (v1.39.x)
//
// Substitui o fluxo encadeado (TefPrintPromptDialog → "Emitindo NFC-e…" →
// PDVV2NFCePostSaleDialog) por um único diálogo que:
//
//  1) Mostra "Processando pagamento…" enquanto o TEF roda (opcional).
//  2) Mostra "Emitindo NFC-e…" enquanto a SEFAZ não responde.
//  3) No fim, pergunta numa tela só quais vias imprimir
//     (Via Estabelecimento TEF, Via Cliente TEF e DANFE NFC-e).
//
// Escopo: APENAS Frente de Caixa. PDV V2, Pedido Express, Cobrança e
// OrderCardChargeDialog continuam usando o TefPrintPromptDialog global + o
// PDVV2NFCePostSaleDialog separado. Nada do TEF (runTefPayment, pinpadService,
// tef-webservice) é alterado.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Printer, CheckCircle, AlertCircle, Receipt } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  consultarNFCe,
  reprocessarNFCe,
  printDanfeFromRecord,
  type NFCeRecord,
  type DanfePrintOptions,
} from '@/services/nfceService';
import {
  executarImpressaoTefVias,
  splitTefVias,
  type TefAutoPrintMode,
} from '@/utils/tefAutoPrint';

export type FrenteCaixaPostSalePhase = 'emitting_nfce' | 'prompt' | 'no_nfce';

export interface FrenteCaixaPostSaleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  /** Linhas do cupom TEF capturadas pelo interceptor — null se não houve TEF. */
  tefReceiptLines?: string[] | null;
  tefDefaultMode?: TefAutoPrintMode;
  tefOrderCode?: string;
  /** Registro inicial da NFC-e — null se a venda não emitiu NFC-e. */
  initialNfceRecord: NFCeRecord | null;
  /** Erro de emissão da NFC-e (quando há). */
  nfceError?: string | null;
  /** Estado externo: a emissão ainda está em andamento. */
  emittingNfce: boolean;
  /** Imprimir DANFE automaticamente quando autorizada (config do PDV). */
  autoPrintDanfe: boolean;
  /** Opções extras de renderização do DANFE (logo, promo, cliente, QR etc.). */
  danfeOptions?: DanfePrintOptions;
  onClosed?: () => void;
}

export function FrenteCaixaPostSaleDialog({
  open,
  onOpenChange,
  companyId,
  tefReceiptLines,
  tefDefaultMode = 'ambas',
  tefOrderCode,
  initialNfceRecord,
  nfceError,
  emittingNfce,
  autoPrintDanfe,
  danfeOptions,
  onClosed,
}: FrenteCaixaPostSaleDialogProps) {
  const [record, setRecord] = useState<NFCeRecord | null>(initialNfceRecord);
  const [status, setStatus] = useState<string>(
    initialNfceRecord?.status || (initialNfceRecord ? 'processando' : 'sem_nfce'),
  );
  const [polling, setPolling] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [printing, setPrinting] = useState(false);
  const [autoFired, setAutoFired] = useState(false);

  const hasTef = !!(tefReceiptLines && tefReceiptLines.length > 0);
  const tefSplit = useMemo(
    () => (hasTef ? splitTefVias(tefReceiptLines!) : null),
    [hasTef, tefReceiptLines],
  );
  const canPrintCliente = !!tefSplit?.cliente;

  // Checkboxes — defaults vindos das configurações do PDV.
  const [checkEstab, setCheckEstab] = useState(true);
  const [checkCliente, setCheckCliente] = useState(true);
  const [checkDanfe, setCheckDanfe] = useState(true);

  // Sincroniza estado interno quando o diálogo abre/recebe novo record.
  useEffect(() => {
    if (!open) return;
    setRecord(initialNfceRecord);
    setStatus(
      initialNfceRecord?.status ||
        (initialNfceRecord ? 'processando' : emittingNfce ? 'processando' : 'sem_nfce'),
    );
    setRetryCount(0);
    setAutoFired(false);
    setCheckEstab(hasTef && tefDefaultMode !== 'none');
    setCheckCliente(hasTef && tefDefaultMode === 'ambas' && canPrintCliente);
    setCheckDanfe(!!initialNfceRecord || emittingNfce);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Atualiza o record quando o parent recebe o registro inicial após a chamada
  // assíncrona à API (emitirNFCe + getNFCeRecordBySaleId).
  useEffect(() => {
    if (!open) return;
    if (initialNfceRecord && initialNfceRecord.id !== record?.id) {
      setRecord(initialNfceRecord);
      setStatus(initialNfceRecord.status || 'processando');
      setCheckDanfe(true);
    }
  }, [open, initialNfceRecord, record?.id]);

  // Polling SEFAZ — mesma lógica do PDVV2NFCePostSaleDialog.
  useEffect(() => {
    if (!open || !record) return;
    if (status !== 'processando' && status !== 'pendente') return;

    setPolling(true);
    let pollCount = 0;
    const interval = setInterval(async () => {
      pollCount++;
      const shouldConsult = pollCount <= 2 || pollCount % 2 === 0;
      if (shouldConsult && record.nfce_id && companyId) {
        try {
          await consultarNFCe(companyId, record.nfce_id);
        } catch (e) {
          console.error('[FC PostSale] consult error:', e);
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
      if ((newStatus === 'rejeitada' || newStatus === 'erro') && retryCount < 1) {
        setRetryCount((c) => c + 1);
        setStatus('processando');
        toast.info('NFC-e rejeitada, tentando reenviar automaticamente...');
        try {
          if (data.nfce_id && companyId) {
            await reprocessarNFCe(companyId, data.nfce_id);
          }
        } catch (e) {
          console.error('[FC PostSale] retry error:', e);
        }
        return;
      }
      setStatus(newStatus);
      if (newStatus === 'autorizada' || newStatus === 'rejeitada' || newStatus === 'erro') {
        setPolling(false);
        clearInterval(interval);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [open, record, status, retryCount, companyId]);

  // Quando tudo terminou (NFC-e resolvida ou inexistente) e autoPrintDanfe = true:
  // imprime DANFE automaticamente uma vez. As vias TEF, por desenho, sempre
  // são confirmadas pelo operador (mesmo no auto) para manter consistência
  // com a tela única — UNLESS tefDefaultMode === 'none'.
  const showPrompt =
    !emittingNfce && (status !== 'processando' && status !== 'pendente');

  useEffect(() => {
    if (!open || autoFired || !showPrompt) return;
    if (autoPrintDanfe && status === 'autorizada' && record) {
      setAutoFired(true);
      printDanfeFromRecord(record, danfeOptions)
        .then(() => toast.success('DANFE impressa automaticamente'))
        .catch((e: any) => toast.error(e?.message || 'Erro ao imprimir DANFE'));
    }
  }, [open, showPrompt, status, record, autoPrintDanfe, autoFired, danfeOptions]);

  function close() {
    onOpenChange(false);
    onClosed?.();
  }

  async function handlePrint() {
    setPrinting(true);
    try {
      // TEF
      if (hasTef && (checkEstab || checkCliente)) {
        const mode: Exclude<TefAutoPrintMode, 'none'> =
          checkEstab && checkCliente && canPrintCliente ? 'ambas' : 'estabelecimento';
        try {
          await executarImpressaoTefVias(tefReceiptLines!, mode, tefOrderCode);
        } catch (e: any) {
          console.error('[FC PostSale] TEF print error:', e);
          toast.error('Falha ao imprimir vias do TEF');
        }
      }
      // DANFE
      if (checkDanfe && record && status === 'autorizada' && !autoFired) {
        try {
          await printDanfeFromRecord(record, danfeOptions);
          toast.success('DANFE enviada para impressão');
        } catch (e: any) {
          toast.error(e?.message || 'Erro ao imprimir DANFE');
        }
      }
    } finally {
      setPrinting(false);
      close();
    }
  }

  const nfceAuthorized = status === 'autorizada' && !!record;
  const nfceFailed = status === 'rejeitada' || status === 'erro' || !!nfceError;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent
        className="max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => { if (!showPrompt) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-5 h-5" />
            Finalização da venda
          </DialogTitle>
          <DialogDescription>
            {emittingNfce || status === 'processando' || status === 'pendente'
              ? 'Aguardando processamento…'
              : 'Selecione o que deseja imprimir'}
          </DialogDescription>
        </DialogHeader>

        {!showPrompt ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground text-center">
              {emittingNfce
                ? 'Emitindo NFC-e… aguardando retorno da SEFAZ.'
                : 'Consultando status da NFC-e…'}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Status NFC-e */}
            {record || nfceError ? (
              <div className="rounded border p-3 text-sm flex items-start gap-2">
                {nfceAuthorized ? (
                  <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  {nfceAuthorized && (
                    <>
                      <p className="font-medium">
                        NFC-e{record?.numero ? ` nº ${record.numero}` : ''} autorizada
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Pronta para impressão do DANFE.
                      </p>
                    </>
                  )}
                  {nfceFailed && (
                    <>
                      <p className="font-medium text-destructive">
                        NFC-e {status === 'rejeitada' ? 'rejeitada' : 'com erro'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {nfceError || record?.motivo_rejeicao || 'Verifique no Monitor NFC-e.'}
                      </p>
                    </>
                  )}
                </div>
              </div>
            ) : null}

            {/* Aviso de impressão automática (config: print_on_finish_mode = 'auto') */}
            {autoFired && nfceAuthorized && (
              <div className="rounded border border-primary/40 bg-primary/5 p-3 text-sm flex items-start gap-2">
                <Printer className="w-4 h-4 text-primary mt-0.5 shrink-0 animate-pulse" />
                <div className="flex-1">
                  <p className="font-medium">DANFE sendo impressa automaticamente</p>
                  <p className="text-xs text-muted-foreground">
                    Configuração "Ação ao salvar a venda" está em modo automático.
                  </p>
                </div>
              </div>
            )}

            {/* Checkboxes */}
            <div className="space-y-2">
              {hasTef && (
                <>
                  <label className="flex items-center gap-3 p-2 rounded border cursor-pointer hover:bg-muted/40">
                    <Checkbox
                      checked={checkEstab}
                      onCheckedChange={(v) => setCheckEstab(!!v)}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Via Estabelecimento (TEF)</div>
                      <div className="text-xs text-muted-foreground">
                        Comprovante do cartão para o caixa.
                      </div>
                    </div>
                  </label>
                  <label
                    className={`flex items-center gap-3 p-2 rounded border ${
                      canPrintCliente ? 'cursor-pointer hover:bg-muted/40' : 'opacity-50'
                    }`}
                  >
                    <Checkbox
                      checked={checkCliente && canPrintCliente}
                      onCheckedChange={(v) => setCheckCliente(!!v)}
                      disabled={!canPrintCliente}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Via Cliente (TEF)</div>
                      <div className="text-xs text-muted-foreground">
                        {canPrintCliente
                          ? 'Comprovante do cartão para o cliente.'
                          : 'A operadora não retornou uma 2ª via separada.'}
                      </div>
                    </div>
                  </label>
                </>
              )}
              {nfceAuthorized && (
                <label className="flex items-center gap-3 p-2 rounded border cursor-pointer hover:bg-muted/40">
                  <Checkbox
                    checked={checkDanfe}
                    onCheckedChange={(v) => setCheckDanfe(!!v)}
                    disabled={autoFired}
                  />
                  <div className="flex-1">
                    <div className="text-sm font-medium">DANFE NFC-e</div>
                    <div className="text-xs text-muted-foreground">
                      {autoFired
                        ? 'Já impressa automaticamente.'
                        : 'Cupom fiscal eletrônico.'}
                    </div>
                  </div>
                </label>
              )}
              {!hasTef && !nfceAuthorized && (
                <p className="text-xs text-muted-foreground text-center py-2">
                  Nada para imprimir nesta venda.
                </p>
              )}
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <Button variant="outline" onClick={close} disabled={printing}>
                Não imprimir
              </Button>
              <Button
                onClick={handlePrint}
                disabled={
                  printing ||
                  (!checkEstab && !checkCliente && !(checkDanfe && nfceAuthorized && !autoFired))
                }
                className="gap-2"
              >
                {printing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4" />
                )}
                Imprimir selecionados
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}