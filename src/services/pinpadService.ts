// TEF WebService (PinPad) Integration Service
// Handles communication with Multiplus Card TEF via Edge Function tef-webservice

import { supabase } from '@/integrations/supabase/client';

export interface PinpadConfig {
  token: string;
  cnpj: string;
  pdv: string;
}

export interface PinpadTransactionResult {
  success: boolean;
  status: 'approved' | 'declined' | 'pending' | 'processing' | 'cancelled' | 'error';
  hash?: string;
  nsu?: string;
  authorizationCode?: string;
  nsuHost?: string;
  acquirer?: string;
  acquirerCnpj?: string;
  cardBrand?: string;
  cardNumber?: string;
  transactionType?: string;
  installments?: string;
  transactionDate?: string;
  transactionTime?: string;
  finalizacao?: string;
  operatorMessage?: string;
  receiptLines?: string[];
  errorMessage?: string;
}

// Store settings keys for PinPad config
const SETTINGS_KEYS = ['pinpad_tef_token', 'pinpad_tef_cnpj', 'pinpad_tef_pdv'];

// Get PinPad TEF config from store_settings
export async function getPinpadConfig(companyId: string): Promise<PinpadConfig | null> {
  const { data, error } = await supabase
    .from('store_settings')
    .select('key, value')
    .eq('company_id', companyId)
    .in('key', SETTINGS_KEYS);

  if (error || !data || data.length === 0) return null;

  const config: Record<string, string> = {};
  data.forEach(s => { if (s.value) config[s.key] = s.value; });

  if (!config.pinpad_tef_token || !config.pinpad_tef_cnpj || !config.pinpad_tef_pdv) {
    return null;
  }

  return {
    token: config.pinpad_tef_token,
    cnpj: config.pinpad_tef_cnpj,
    pdv: config.pinpad_tef_pdv,
  };
}

// Save PinPad TEF config
export async function savePinpadConfig(companyId: string, config: PinpadConfig): Promise<boolean> {
  const settings = [
    { key: 'pinpad_tef_token', value: config.token },
    { key: 'pinpad_tef_cnpj', value: config.cnpj },
    { key: 'pinpad_tef_pdv', value: config.pdv },
  ];

  for (const setting of settings) {
    const { data: existing } = await supabase
      .from('store_settings')
      .select('id')
      .eq('company_id', companyId)
      .eq('key', setting.key)
      .maybeSingle();

    let error;
    if (existing) {
      const result = await supabase
        .from('store_settings')
        .update({ value: setting.value })
        .eq('id', existing.id);
      error = result.error;
    } else {
      const result = await supabase
        .from('store_settings')
        .insert({ company_id: companyId, key: setting.key, value: setting.value });
      error = result.error;
    }

    if (error) {
      console.error('[PinPad] Error saving config:', error);
      return false;
    }
  }
  return true;
}

// Check if PinPad TEF is configured
export async function isPinpadConfigured(companyId: string): Promise<boolean> {
  const config = await getPinpadConfig(companyId);
  return config !== null;
}

// Call the tef-webservice edge function
async function callTefWebService(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('tef-webservice', { body });
  if (error) {
    console.error('[PinPad] Edge function error:', error);
    throw new Error(error.message || 'Erro ao comunicar com TEF WebService');
  }
  return data;
}

// Check if Gerenciador Padrão is active (ATV)
export async function checkPinpadActive(companyId: string): Promise<{ active: boolean; message?: string }> {
  const config = await getPinpadConfig(companyId);
  if (!config) return { active: false, message: 'PinPad não configurado' };

  try {
    const result = await callTefWebService({
      action: 'atv',
      token: config.token,
      cnpj: config.cnpj,
      pdv: config.pdv,
    });
    return { active: result.success || result.active, message: result.message };
  } catch (error) {
    return { active: false, message: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

// Map payment type to TEF 800-001 code
function mapPaymentTypeToTef(type: 'credit' | 'debit' | 'pix'): number {
  switch (type) {
    case 'credit': return 0;
    case 'debit': return 1;
    case 'pix': return 5;
    default: return 0;
  }
}

// Send payment to PinPad (CRT)
export async function sendPinpadPayment(
  companyId: string,
  options: {
    amount: number;
    paymentType: 'credit' | 'debit' | 'pix';
    installments?: number;
    documentoFiscal?: string;
  }
): Promise<{ success: boolean; hash?: string; errorMessage?: string }> {
  const config = await getPinpadConfig(companyId);
  if (!config) return { success: false, errorMessage: 'PinPad não configurado' };

  try {
    const result = await callTefWebService({
      action: 'crt',
      token: config.token,
      cnpj: config.cnpj,
      pdv: config.pdv,
      amount: options.amount,
      identificacao: String(Date.now()),
      paymentType: mapPaymentTypeToTef(options.paymentType),
      installments: options.installments || 1,
      documentoFiscal: options.documentoFiscal,
      equipment: 1, // PinPad
    });

    return result;
  } catch (error) {
    return { success: false, errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

// Poll transaction status (GetVendasTef)
export async function pollPinpadStatus(
  companyId: string,
  hash: string
): Promise<PinpadTransactionResult> {
  const config = await getPinpadConfig(companyId);
  if (!config) return { success: false, status: 'error', errorMessage: 'PinPad não configurado' };

  try {
    const result = await callTefWebService({
      action: 'get-status',
      token: config.token,
      hash,
    });

    return {
      success: result.success || false,
      status: result.status || 'error',
      hash,
      nsu: result.nsu,
      authorizationCode: result.authorizationCode,
      nsuHost: result.nsuHost,
      acquirer: result.acquirer,
      acquirerCnpj: result.acquirerCnpj,
      cardBrand: result.cardBrand,
      cardNumber: result.cardNumber,
      transactionType: result.transactionType,
      installments: result.installments,
      transactionDate: result.transactionDate,
      transactionTime: result.transactionTime,
      finalizacao: result.finalizacao,
      operatorMessage: result.operatorMessage,
      receiptLines: result.receiptLines,
      errorMessage: result.errorMessage,
    };
  } catch (error) {
    return { success: false, status: 'error', errorMessage: error instanceof Error ? error.message : 'Erro desconhecido' };
  }
}

// Confirm transaction (CNF) - MUST be called after approved transaction
export async function confirmPinpadTransaction(
  companyId: string,
  options: { identificacao: string; rede?: string; nsu?: string; finalizacao?: string }
): Promise<boolean> {
  const config = await getPinpadConfig(companyId);
  if (!config) return false;

  try {
    const result = await callTefWebService({
      action: 'cnf',
      token: config.token,
      cnpj: config.cnpj,
      pdv: config.pdv,
      ...options,
    });
    return result.success;
  } catch {
    return false;
  }
}

// Non-confirm transaction (NCN) - Call if sale is cancelled after approval
export async function cancelPinpadTransaction(
  companyId: string,
  options: { identificacao: string; rede?: string; nsu?: string; finalizacao?: string }
): Promise<boolean> {
  const config = await getPinpadConfig(companyId);
  if (!config) return false;

  try {
    const result = await callTefWebService({
      action: 'ncn',
      token: config.token,
      cnpj: config.cnpj,
      pdv: config.pdv,
      ...options,
    });
    return result.success;
  } catch {
    return false;
  }
}
