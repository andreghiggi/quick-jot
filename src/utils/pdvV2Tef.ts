// Fluxo TEF (PinPad / SmartPOS) compartilhado pelo PDV V2.
// Replica exatamente a lógica do PDV V1 (src/pages/PDV.tsx) para garantir
// que as integrações homologadas continuem funcionando idênticas.

import { toast } from 'sonner';
import {
  sendPinpadPayment,
  pollPinpadStatus,
  confirmPinpadTransaction,
  cancelPinpadTransaction,
} from '@/services/pinpadService';
import {
  sendPaymentToMultiplusCard,
  checkMultiplusCardTransactionStatus,
  abortMultiplusCardSale,
} from '@/services/multiplusCardService';
import type { NFCeTefData } from '@/services/nfceService';

export type TefIntegration = 'tef_pinpad' | 'tef_smartpos';

export interface TefOptions {
  /** 'avista' | 'parcelado' | 'debit' | 'pix' */
  modality: 'avista' | 'parcelado' | 'debit' | 'pix';
  /** Apenas quando modality === 'parcelado' */
  installments?: number;
  /** 'adm' (default) ou 'loja' — usado no rótulo da nota */
  installmentType?: 'adm' | 'loja';
}

export interface RunTefArgs {
  companyId: string;
  integration: TefIntegration;
  amount: number;
  options: TefOptions;
  /** Descrição opcional (ex.: nome do cliente) — apenas SmartPOS */
  description?: string;
  onStatus?: (msg: string) => void;
}

export interface RunTefResult {
  success: boolean;
  errorMessage?: string;
  /** Trecho a anexar nas notes da venda (formato V1) */
  notesFragment?: string;
  /** Dados para passar como `tef` ao emitir NFC-e */
  tefData?: NFCeTefData;
}

/**
 * Executa o fluxo TEF completo (CRT → polling → CNF) e devolve os dados
 * para serem persistidos na venda + repassados à NFC-e. Aborta sem criar
 * a venda em qualquer falha — exatamente como o PDV V1.
 */
export async function runTefPayment(args: RunTefArgs): Promise<RunTefResult> {
  const { companyId, integration, amount, options, description, onStatus } = args;
  const tefPaymentType: 'credit' | 'debit' | 'pix' =
    options.modality === 'debit'
      ? 'debit'
      : options.modality === 'pix'
        ? 'pix'
        : 'credit';
  const installmentCount =
    options.modality === 'debit' || options.modality === 'pix'
      ? 1
      : options.modality === 'parcelado'
        ? Math.max(2, options.installments || 2)
        : 1;
  const installmentType = options.installmentType || 'adm';

  if (integration === 'tef_pinpad') {
    onStatus?.('Enviando para PinPad...');
    try {
      const createResult = await sendPinpadPayment(companyId, {
        amount,
        paymentType: tefPaymentType,
        installments: installmentCount,
        installmentType,
      });

      if (!createResult.success || !createResult.hash) {
        toast.error(`Erro TEF PinPad: ${createResult.errorMessage || 'falha ao iniciar'}`);
        return { success: false, errorMessage: createResult.errorMessage };
      }

      const crtIdentificacao = createResult.identificacao || '';
      onStatus?.('Aguardando pagamento no PinPad...');

      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const statusResult = await pollPinpadStatus(companyId, createResult.hash);

        if (statusResult.status === 'processing') {
          onStatus?.('Processando pagamento no PinPad...');
          continue;
        }

        if (statusResult.status === 'approved' && statusResult.success) {
          onStatus?.('Pagamento aprovado!');
          toast.success(`TEF PinPad aprovado! NSU: ${statusResult.nsu}`);

          await confirmPinpadTransaction(companyId, {
            identificacao: crtIdentificacao,
            rede: statusResult.acquirer,
            nsu: statusResult.nsu,
            finalizacao: statusResult.finalizacao,
          });

          const installTypeLabel = installmentType === 'adm' ? ' ADM' : ' Loja';
          const installLabel =
            tefPaymentType === 'debit'
              ? ' | Débito'
              : installmentCount > 1
                ? ` | ${installmentCount}x Cartão${installTypeLabel}`
                : ' | Crédito à Vista';
          const receiptData =
            statusResult.receiptLines && statusResult.receiptLines.length > 0
              ? ` | [COMPROVANTE]${statusResult.receiptLines.join('\\n')}[/COMPROVANTE]`
              : '';

          return {
            success: true,
            notesFragment: `TEF PinPad: NSU ${statusResult.nsu} | Aut ${statusResult.authorizationCode} | ${statusResult.cardBrand} | ${statusResult.acquirer}${installLabel}${receiptData}`,
            tefData: {
              nsu: statusResult.nsu || '',
              autorizacao: statusResult.authorizationCode || '',
              bandeira: statusResult.cardBrand || '',
              adquirente: statusResult.acquirer || '',
              tipo_pagamento: tefPaymentType,
              valor: amount,
            },
          };
        }

        if (
          statusResult.status === 'declined' ||
          statusResult.status === 'cancelled' ||
          statusResult.status === 'error'
        ) {
          const msg =
            statusResult.errorMessage || statusResult.operatorMessage || 'Pagamento não aprovado';
          toast.error(`TEF PinPad: ${msg}`);
          return { success: false, errorMessage: msg };
        }
      }

      toast.warning('Timeout aguardando resposta do PinPad.');
      return { success: false, errorMessage: 'Timeout PinPad' };
    } catch (err: any) {
      console.error('[PDVV2] TEF PinPad error:', err);
      toast.error(`Erro TEF PinPad: ${err?.message || 'Erro desconhecido'}`);
      return { success: false, errorMessage: err?.message };
    }
  }

  // ===== SmartPOS (PINPDV) =====
  onStatus?.('Enviando para maquininha...');
  const tefIdentifier = `pdvv2-${Date.now()}`;
  try {
    const createResult = await sendPaymentToMultiplusCard(companyId, {
      amount,
      paymentType: tefPaymentType,
      installments: installmentCount,
      identifier: tefIdentifier,
      description: description || 'Venda PDV',
    });

    if (!createResult.success) {
      toast.error(`Erro TEF: ${createResult.errorMessage || 'falha ao iniciar'}`);
      return { success: false, errorMessage: createResult.errorMessage };
    }

    onStatus?.('Aguardando pagamento na maquininha...');
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const statusResult = await checkMultiplusCardTransactionStatus(companyId, tefIdentifier);

      if (statusResult.status === 'processing') {
        onStatus?.('Processando pagamento...');
        continue;
      }

      if (statusResult.status === 'approved' && statusResult.success) {
        onStatus?.('Pagamento aprovado!');
        toast.success(`TEF aprovado! NSU: ${statusResult.nsu}`);

        const installLabel =
          tefPaymentType === 'debit'
            ? ' | Débito'
            : installmentCount > 1
              ? ` | ${installmentCount}x Crédito`
              : ' | Crédito à Vista';

        return {
          success: true,
          notesFragment: `TEF: NSU ${statusResult.nsu} | Aut ${statusResult.authorizationCode} | ${statusResult.cardBrand}${installLabel}`,
          tefData: {
            nsu: statusResult.nsu || '',
            autorizacao: statusResult.authorizationCode || '',
            bandeira: statusResult.cardBrand || '',
            adquirente: statusResult.acquirer || '',
            tipo_pagamento: tefPaymentType,
            valor: amount,
          },
        };
      }

      if (statusResult.status === 'cancelled' || statusResult.status === 'error') {
        const msg = statusResult.errorMessage || 'Pagamento não aprovado';
        toast.error(`TEF: ${msg}`);
        return { success: false, errorMessage: msg };
      }
    }

    toast.warning('Timeout aguardando resposta da maquininha.');
    try { await abortMultiplusCardSale(companyId, tefIdentifier, true); } catch { /* ignore */ }
    return { success: false, errorMessage: 'Timeout SmartPOS' };
  } catch (err: any) {
    console.error('[PDVV2] TEF SmartPOS error:', err);
    toast.error(`Erro TEF: ${err?.message || 'Erro desconhecido'}`);
    return { success: false, errorMessage: err?.message };
  }
}