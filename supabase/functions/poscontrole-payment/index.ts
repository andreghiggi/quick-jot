import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AuthResponse {
  token: string;
  expires_in: number;
}

interface PaymentRequest {
  apiUser: string;
  apiPassword: string;
  terminalId: string;
  amount: number;
  paymentType: 'credit' | 'debit' | 'pix';
  installments?: number;
}

interface PaymentResponse {
  success: boolean;
  transactionId?: string;
  nsu?: string;
  authorizationCode?: string;
  errorMessage?: string;
  status?: string;
}

const POSCONTROLE_BASE_URL = 'https://poscontrole.azure-api.net';

async function authenticate(apiUser: string, apiPassword: string): Promise<string> {
  console.log('[POS Controle] Authenticating...');
  
  const response = await fetch(`${POSCONTROLE_BASE_URL}/auth/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      user: apiUser,
      password: apiPassword,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[POS Controle] Auth failed:', errorText);
    throw new Error(`Falha na autenticação: ${response.status}`);
  }

  const data: AuthResponse = await response.json();
  console.log('[POS Controle] Auth successful, token expires in:', data.expires_in);
  return data.token;
}

async function sendPaymentCommand(
  token: string,
  terminalId: string,
  amount: number,
  paymentType: string,
  installments: number = 1
): Promise<PaymentResponse> {
  console.log('[POS Controle] Sending payment command to terminal:', terminalId);
  
  // Map payment type to POS Controle format
  const operationType = paymentType === 'credit' ? 'CREDITO' : 
                        paymentType === 'debit' ? 'DEBITO' : 'PIX';
  
  const response = await fetch(`${POSCONTROLE_BASE_URL}/pos_upd`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      terminal_id: terminalId,
      operation: 'VENDA',
      operation_type: operationType,
      value: Math.round(amount * 100), // Convert to cents
      installments: installments,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[POS Controle] Payment command failed:', errorText);
    return {
      success: false,
      errorMessage: `Erro ao enviar comando: ${response.status}`,
    };
  }

  const data = await response.json();
  console.log('[POS Controle] Payment command response:', data);

  return {
    success: true,
    transactionId: data.transaction_id,
    status: 'pending_terminal', // The terminal will process and we need to poll for result
  };
}

async function checkTransactionStatus(
  token: string,
  transactionId: string
): Promise<PaymentResponse> {
  console.log('[POS Controle] Checking transaction status:', transactionId);
  
  const response = await fetch(`${POSCONTROLE_BASE_URL}/pos_status/${transactionId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    return {
      success: false,
      errorMessage: 'Erro ao verificar status',
    };
  }

  const data = await response.json();
  
  if (data.status === 'APROVADO' || data.status === 'APPROVED') {
    return {
      success: true,
      transactionId: data.transaction_id,
      nsu: data.nsu,
      authorizationCode: data.authorization_code,
      status: 'approved',
    };
  } else if (data.status === 'NEGADO' || data.status === 'DECLINED') {
    return {
      success: false,
      errorMessage: data.message || 'Transação negada',
      status: 'declined',
    };
  } else {
    return {
      success: false,
      status: data.status?.toLowerCase() || 'pending',
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, ...params } = await req.json();

    if (action === 'payment') {
      const { apiUser, apiPassword, terminalId, amount, paymentType, installments } = params as PaymentRequest;
      
      if (!apiUser || !apiPassword || !terminalId) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'Credenciais POS Controle não configuradas' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Authenticate
      const token = await authenticate(apiUser, apiPassword);
      
      // Send payment command
      const result = await sendPaymentCommand(token, terminalId, amount, paymentType, installments);
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (action === 'status') {
      const { apiUser, apiPassword, transactionId } = params;
      
      const token = await authenticate(apiUser, apiPassword);
      const result = await checkTransactionStatus(token, transactionId);
      
      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, errorMessage: 'Ação inválida' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('[POS Controle] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
