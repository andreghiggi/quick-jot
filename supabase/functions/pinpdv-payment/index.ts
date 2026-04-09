import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Use new URL from July 2025
const PINPDV_BASE_URL = 'https://api.pinpdv.com.br';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, apiToken, ...params } = await req.json();

    if (!apiToken) {
      return new Response(
        JSON.stringify({ success: false, errorMessage: 'Token não informado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    const authHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    // List available PINPDV devices
    if (action === 'list-devices') {
      const response = await fetch(`${PINPDV_BASE_URL}/pinpdv`, {
        method: 'GET',
        headers: authHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PINPDV] List devices failed:', errorText);
        return new Response(
          JSON.stringify({ success: false, devices: [], errorMessage: `Erro: ${response.status}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      return new Response(
        JSON.stringify({ success: true, devices: data.data || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a POS TEF sale
    if (action === 'create-sale') {
      const { pinpdvId, identifier, amount, paymentType, installments, description } = params;

      console.log('[PINPDV] Creating sale:', { pinpdvId, identifier, amount, paymentType });

      const body: Record<string, unknown> = {
        PinPdvId: pinpdvId,
        Identificador: identifier,
        Valor: amount,
        Descricao: description || 'Venda PDV',
      };

      // Payment type is optional; if provided, installments are required
      if (paymentType && paymentType > 0) {
        body.TipoPagamento = paymentType;
        body.Parcelas = installments || 1;
      }

      const response = await fetch(`${PINPDV_BASE_URL}/pos-venda`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PINPDV] Create sale failed:', errorText);
        return new Response(
          JSON.stringify({ success: false, errorMessage: `Erro ao criar venda: ${response.status} - ${errorText}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log('[PINPDV] Sale created:', data);

      return new Response(
        JSON.stringify({
          success: true,
          posVendaId: data.id,
          identifier,
          status: 'pending',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check sale status
    if (action === 'check-status') {
      const { identifier } = params;

      console.log('[PINPDV] Checking status for:', identifier);

      const response = await fetch(`${PINPDV_BASE_URL}/pos-venda/${identifier}`, {
        method: 'GET',
        headers: authHeaders,
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[PINPDV] Status check failed:', errorText);
        return new Response(
          JSON.stringify({ success: false, errorMessage: `Erro ao consultar: ${response.status}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const data = await response.json();
      console.log('[PINPDV] Status response:', JSON.stringify(data));

      // Status: 0=Aguardando, 1=Processando, 2=Concluido
      const statusKey = data.status?.key;

      if (statusKey === 2) {
        // Concluido - extract transaction data
        const venda = data.vendas?.[0];
        const transacao = venda?.transacoes?.[0];

        if (venda?.status?.key === 0 && transacao?.status?.key === 0) {
          // Realizada + Aprovada
          return new Response(
            JSON.stringify({
              success: true,
              status: 'approved',
              identifier: data.identificador,
              vendaIdentificador: venda.identificador,
              nsu: transacao.dados?.nsu || '',
              authorizationCode: transacao.dados?.autorizacao || '',
              cardBrand: transacao.dados?.bandeira || '',
              acquirer: transacao.dados?.adquirente || '',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        // Sale completed but with error/cancellation
        if (venda?.status?.key === 8) {
          return new Response(
            JSON.stringify({
              success: false,
              status: 'cancelled',
              errorMessage: 'Venda cancelada no terminal',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (venda?.status?.key === 9) {
          return new Response(
            JSON.stringify({
              success: false,
              status: 'error',
              errorMessage: 'Erro na transação no terminal',
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      // Still pending or processing
      return new Response(
        JSON.stringify({
          success: false,
          status: statusKey === 0 ? 'waiting' : statusKey === 1 ? 'processing' : 'unknown',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Abort a sale
    if (action === 'abort-sale') {
      const { identifier, force } = params;
      const url = force
        ? `${PINPDV_BASE_URL}/pos-venda/${identifier}?forca=true`
        : `${PINPDV_BASE_URL}/pos-venda/${identifier}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: authHeaders,
      });

      return new Response(
        JSON.stringify({ success: response.ok }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, errorMessage: 'Ação inválida' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('[PINPDV] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
