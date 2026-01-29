// POS Controle Integration Service
// Handles communication with the POS Controle API via Edge Function

import { supabase } from '@/integrations/supabase/client';

export interface POSControleConfig {
  apiUser: string;
  apiPassword: string;
  terminalId: string;
}

export interface POSControlePaymentRequest {
  amount: number;
  paymentType: 'credit' | 'debit' | 'pix';
  installments?: number;
}

export interface POSControlePaymentResponse {
  success: boolean;
  transactionId?: string;
  nsu?: string;
  authorizationCode?: string;
  errorMessage?: string;
  status?: string;
}

// Get POS Controle configuration from store_settings
export async function getPOSControleConfig(companyId: string): Promise<POSControleConfig | null> {
  const { data, error } = await supabase
    .from('store_settings')
    .select('key, value')
    .eq('company_id', companyId)
    .in('key', ['poscontrole_api_user', 'poscontrole_api_password', 'poscontrole_terminal_id']);

  if (error || !data || data.length === 0) {
    console.log('[POS Controle] No configuration found');
    return null;
  }

  const config: Record<string, string> = {};
  data.forEach(setting => {
    if (setting.value) {
      config[setting.key] = setting.value;
    }
  });

  if (!config.poscontrole_api_user || !config.poscontrole_api_password || !config.poscontrole_terminal_id) {
    console.log('[POS Controle] Incomplete configuration');
    return null;
  }

  return {
    apiUser: config.poscontrole_api_user,
    apiPassword: config.poscontrole_api_password,
    terminalId: config.poscontrole_terminal_id,
  };
}

// Save POS Controle configuration
export async function savePOSControleConfig(companyId: string, config: POSControleConfig): Promise<boolean> {
  const settings = [
    { key: 'poscontrole_api_user', value: config.apiUser },
    { key: 'poscontrole_api_password', value: config.apiPassword },
    { key: 'poscontrole_terminal_id', value: config.terminalId },
  ];

  for (const setting of settings) {
    // First check if exists
    const { data: existing } = await supabase
      .from('store_settings')
      .select('id')
      .eq('company_id', companyId)
      .eq('key', setting.key)
      .maybeSingle();

    let error;
    if (existing) {
      // Update existing
      const result = await supabase
        .from('store_settings')
        .update({ value: setting.value })
        .eq('id', existing.id);
      error = result.error;
    } else {
      // Insert new
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
      console.error('[POS Controle] Error saving config:', error);
      return false;
    }
  }

  return true;
}

// Check if POS Controle is configured
export async function isPOSControleConfigured(companyId: string): Promise<boolean> {
  const config = await getPOSControleConfig(companyId);
  return config !== null;
}

// Send payment to POS Controle terminal
export async function sendPaymentToPOSControle(
  companyId: string,
  request: POSControlePaymentRequest
): Promise<POSControlePaymentResponse> {
  const config = await getPOSControleConfig(companyId);
  
  if (!config) {
    return {
      success: false,
      errorMessage: 'POS Controle não configurado. Configure em Integrações.',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('poscontrole-payment', {
      body: {
        action: 'payment',
        apiUser: config.apiUser,
        apiPassword: config.apiPassword,
        terminalId: config.terminalId,
        amount: request.amount,
        paymentType: request.paymentType,
        installments: request.installments || 1,
      },
    });

    if (error) {
      console.error('[POS Controle] Edge function error:', error);
      return {
        success: false,
        errorMessage: error.message || 'Erro ao comunicar com POS Controle',
      };
    }

    return data as POSControlePaymentResponse;
  } catch (error) {
    console.error('[POS Controle] Request error:', error);
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}

// Check transaction status
export async function checkPOSControleTransactionStatus(
  companyId: string,
  transactionId: string
): Promise<POSControlePaymentResponse> {
  const config = await getPOSControleConfig(companyId);
  
  if (!config) {
    return {
      success: false,
      errorMessage: 'POS Controle não configurado',
    };
  }

  try {
    const { data, error } = await supabase.functions.invoke('poscontrole-payment', {
      body: {
        action: 'status',
        apiUser: config.apiUser,
        apiPassword: config.apiPassword,
        transactionId,
      },
    });

    if (error) {
      return {
        success: false,
        errorMessage: error.message,
      };
    }

    return data as POSControlePaymentResponse;
  } catch (error) {
    return {
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Erro desconhecido',
    };
  }
}
