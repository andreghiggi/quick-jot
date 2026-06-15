// Auditoria de cancelamento de vendas no PDV V2.
// Toda venda cancelada precisa registrar motivo (>=20 chars), quem cancelou,
// quando, em qual caixa e se houve estorno TEF.
import { supabase } from '@/integrations/supabase/client';

export interface SaleCancellationRecord {
  id: string;
  sale_id: string;
  company_id: string;
  register_id: string | null;
  cancelled_by: string | null;
  cancelled_by_name: string | null;
  cancelled_at: string;
  reason: string;
  tef_reversed: boolean;
}

export const CANCEL_REASON_MIN_LENGTH = 20;

export interface CreateCancellationParams {
  saleId: string;
  companyId: string;
  registerId?: string | null;
  cancelledBy?: string | null;
  cancelledByName?: string | null;
  reason: string;
  tefReversed?: boolean;
}

export async function insertSaleCancellation(params: CreateCancellationParams): Promise<SaleCancellationRecord | null> {
  const reason = (params.reason || '').trim();
  if (reason.length < CANCEL_REASON_MIN_LENGTH) {
    throw new Error(`Motivo do cancelamento deve ter ao menos ${CANCEL_REASON_MIN_LENGTH} caracteres.`);
  }
  const { data, error } = await (supabase as any)
    .from('pdv_sale_cancellations')
    .insert({
      sale_id: params.saleId,
      company_id: params.companyId,
      register_id: params.registerId || null,
      cancelled_by: params.cancelledBy || null,
      cancelled_by_name: params.cancelledByName || null,
      reason,
      tef_reversed: !!params.tefReversed,
    })
    .select('*')
    .maybeSingle();
  if (error) throw error;
  return (data as SaleCancellationRecord) || null;
}

export async function loadCancellationsBySaleIds(saleIds: string[]): Promise<Record<string, SaleCancellationRecord>> {
  if (!saleIds.length) return {};
  const { data, error } = await (supabase as any)
    .from('pdv_sale_cancellations')
    .select('*')
    .in('sale_id', saleIds)
    .order('cancelled_at', { ascending: false });
  if (error) throw error;
  const map: Record<string, SaleCancellationRecord> = {};
  for (const row of (data || []) as SaleCancellationRecord[]) {
    // Se houver mais de um registro por venda (não deveria), mantém o mais recente (já ordenado).
    if (!map[row.sale_id]) map[row.sale_id] = row;
  }
  return map;
}

/** Constrói o `notes` da venda com o marcador [CANCELADA] e o motivo embutido (para legados/exportação). */
export function buildCancelledNotes(currentNotes: string | null | undefined, reason: string): string {
  const base = currentNotes || '';
  if (base.includes('[CANCELADA]')) return base;
  const safeReason = reason.replace(/\r?\n/g, ' ').trim();
  return `[CANCELADA] Motivo: ${safeReason} | ${base}`.trim();
}

export function formatCancelledAt(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}