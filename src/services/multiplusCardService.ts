// Multiplus Card PINPDV Integration Service
// Handles communication with the PINPDV API via Edge Function

import { supabase } from '@/integrations/supabase/client';

export interface MultiplusCardConfig {
  apiToken: string;
  pinpdvId: string;
  pinpdvNome?: string;
}

export interface MultiplusCardPaymentRequest {
  amount: number;
  paymentType: 'credit' | 'debit' | 'pix';
  installments?: number;
  identifier?: string;
  description?: string;
}

export interface MultiplusCardPaymentResponse {
  success: boolean;
  posVendaId?: number;
  identifier?: string;
  nsu?: string;
  authorizationCode?: string;
  cardBrand?: string;
  acquirer?: string;
  errorMessage?: string;
  status?: string;
  vendaIdentificador?: string;
}

export interface PinPdvDevice {
  id: number;
  codigo: string;
  nome: string;
  isAtivo: boolean;
  heartbeat: string;
}

// Get Multiplus Card configuration from store_settings
export async function getMultiplusCardConfig(companyId: string): Promise<MultiplusCardConfig | null> {
  const { data, error } = await supabase
    .from('store_settings')
    .select('key, value')
    .eq('company_id', companyId)
    .in('key', ['multiplus_api_token', 'multiplus_pinpdv_id', 'multiplus_pinpdv_nome']);

  if (error || !data || data.length === 0) {
    return null;
  }

  const config: Record<string, string> = {};
  data.forEach(setting => {
    if (setting.value) {
      config[setting.key] = setting.value;
    }
  });

  if (!config.multiplus_api_token || !config.multiplus_pinpdv_id) {
    return null;
  }

  return {
    apiToken: config.multiplus_api_token,
    pinpdvId: config.multiplus_pinpdv_id,
    pinpdvNome: config.multiplus_pinpdv_nome || '',
  };
}

// Save Multiplus Card configuration
export async function saveMultiplusCardConfig(companyId: string, config: MultiplusCardConfig): Promise<boolean> {
  const settings = [
    { key: 'multiplus_api_token', value: config.apiToken },
    { key: 'multiplus_pinpdv_id', value: config.pinpdvId },
    { key: 'multiplus_pinpdv_nome', value: config.pinpdvNome || '' },
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
        .insert({
          company_id: companyId,
          key: setting.key,
          value: setting.value,
        });
      error = result.error;
    }

    if (error) {
      console.error('[Multiplus Card] Error saving config:', error);
      return false;
    }
  }

  return true;
}

// Check if Multiplus Card is configured
export async function isMultiplusCardConfigured(companyId: string): Promise<boolean> {
  const config = await getMultiplusCardConfig(companyId);
  return config !== null;
}

// List available PINPDV devices
export async function listPinPdvDevices(companyId: string): Promise<PinPdvDevice[]> {
  const config = await getMultiplusCardConfig(companyId);
  if (!config) return [];

  try {
    const { data, error } = await supabase.functions.invoke('pinpdv-payment', {
      body: {
        action: 'list-devices',
        apiToken: config.apiToken,
      },
    });

    if (error) {
      console.error('[Multiplus Card] Error listing devices:', error);
      return [];
    }

    return data?.devices || [];
  } catch (error) {
    console.error('[Multiplus Card] Request error:', error);
    return [];
  }
}

// Map payment type to PINPDV numeric type
function mapPaymentType(type: string): number {
  switch (type) {
    case 'credit': return 2;
    case 'debit': return 3;
    case 'pix': return 4;
    default: return 0;
  }
}

// Send payment to PINPDV terminal (POS TEF mode)
export async function sendPaymentToMultiplusCard(
  companyId: string,
  request: MultiplusCardPaymentRequest
): Promise<MultiplusCardPaymentResponse> {
  const config = await getMultiplusCardConfig(companyId);
  
  if (!config) {
    return {
      success: false,
      errorMessage: 'Multiplus Card não configurado. Configure em Integrações.',
    };
  }

  try {
    const identifier = request.identifier || `venda-${Date.now()}`;

    const { data, error } = await supabase.functions.invoke('pinpdv-payment', {
      body: {
        action: 'create-sale',
        apiToken: config.apiToken,
        pinpdvId: parseInt(config.pinpdvId),
        identifier,
        amount: request.amount,
        paymentType: mapPaymentType(request.paymentType),
        installments: request.installments || 1,
        description: request.description || 'Venda PDV',
      },
    });

    if (error) {
      console.error('[Multiplus Card] Edge function error:', error);
      return {
        success: false,
        errorMessage: error.message || 'Erro ao comunicar com Multiplus Card',
      };
    }

    return data as MultiplusCardPaymentResponse;
  } catch (error) {
    console.error('[Multiplus Card] Request error:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// Check transaction status via polling
export async function checkMultiplusCardTransactionStatus(
  companyId: string,
  identifier: string
): Promise<MultiplusCardPaymentResponse> {
  const config = await getMultiplusCardConfig(companyId);
  
  if (!config) {
    return {
      success: false,
      errorMessage: 'Multiplus Card não configurado',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('pinpdv-payment', {
      body: {
        action: 'check-status',
        apiToken: config.apiToken,
        identifier,
      },
    });

    if (error) {
      return {
        success: false,
        errorMessage: error.message,
      };
    }

    return data as MultiplusCardPaymentResponse;
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// Abort a pending sale
export async function abortMultiplusCardSale(
  companyId: string,
  identifier: string,
  force: boolean = false
): Promise<boolean> {
  const config = await getMultiplusCardConfig(companyId);
  if (!config) return false;

  try {
    const { data, error } = await supabase.functions.invoke('pinpdv-payment', {
      body: {
        action: 'abort-sale',
        apiToken: config.apiToken,
        identifier,
        force,
      },
    });

    if (error) return false;
    return data?.success || false;
  } catch {
    return false;
  }
}
