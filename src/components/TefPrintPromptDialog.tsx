import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer } from 'lucide-react';
import {
  TEF_PRINT_PROMPT_EVENT,
  type TefPrintPromptPayload,
  type TefAutoPrintMode,
  executarImpressaoTefVias,
} from '@/utils/tefAutoPrint';

/**
 * Evento disparado quando o prompt TEF é fechado (por confirmação ou cancelamento).
 * Usado para serializar a abertura do diálogo pós-venda da NFC-e (Lancheria I9),
 * evitando que o overlay da NFC-e cubra os botões de impressão TEF.
 */
export const TEF_PRINT_PROMPT_CLOSED_EVENT = 'tef-auto-print-prompt-closed';

/**
 * Modal global de confirmação de impressão TEF.
 * Escuta o evento `tef-auto-print-prompt` disparado por
 * `imprimirComprovanteTefAutomatico` e pergunta ao operador quais vias
 * deseja imprimir. A opção pré-selecionada vem de
 * `store_settings.tef_auto_print_vias`.
 */
export function TefPrintPromptDialog() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<TefPrintPromptPayload | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    function handler(e: Event) {
      const ce = e as CustomEvent<TefPrintPromptPayload>;
      if (!ce.detail) return;
      setPayload(ce.detail);
      setOpen(true);
      window.dispatchEvent(new CustomEvent('tef-auto-print-prompt-opened'));
    }
    window.addEventListener(TEF_PRINT_PROMPT_EVENT, handler as EventListener);
    return () => window.removeEventListener(TEF_PRINT_PROMPT_EVENT, handler as EventListener);
  }, []);

  async function handleChoice(choice: Exclude<TefAutoPrintMode, 'none'> | 'cancel') {
    if (!payload) {
      setOpen(false);
      window.dispatchEvent(new CustomEvent(TEF_PRINT_PROMPT_CLOSED_EVENT));
      return;
    }
    if (choice === 'cancel') {
      setOpen(false);
      setPayload(null);
      window.dispatchEvent(new CustomEvent(TEF_PRINT_PROMPT_CLOSED_EVENT));
      return;
    }
    setBusy(true);
    try {
      await executarImpressaoTefVias(payload.receiptLines, choice, payload.orderCode);
    } finally {
      setBusy(false);
      setOpen(false);
      setPayload(null);
      window.dispatchEvent(new CustomEvent(TEF_PRINT_PROMPT_CLOSED_EVENT));
    }
  }

  const def = payload?.defaultMode ?? 'ambas';

  return (
    <Dialog open={open} onOpenChange={() => { /* fechamento apenas via botões explícitos */ }}>
      <DialogContent className="sm:max-w-md z-[10001]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-5 w-5" />
            Imprimir comprovante TEF?
          </DialogTitle>
          <DialogDescription>
            Pagamento aprovado. Selecione quais vias deseja imprimir agora.
            A reimpressão manual continua disponível no card do pedido.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2 pt-2">
          <Button
            disabled={busy}
            variant={def === 'ambas' ? 'default' : 'outline'}
            onClick={() => handleChoice('ambas')}
          >
            Ambas as vias (Estabelecimento + Cliente)
          </Button>
          <Button
            disabled={busy}
            variant={def === 'estabelecimento' ? 'default' : 'outline'}
            onClick={() => handleChoice('estabelecimento')}
          >
            Só via do Estabelecimento
          </Button>
          <Button
            disabled={busy}
            variant="ghost"
            onClick={() => handleChoice('cancel')}
          >
            Não imprimir agora
          </Button>
        </div>
        <DialogFooter />
      </DialogContent>
    </Dialog>
  );
}
