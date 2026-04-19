import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PINPDV_BASE_URL = 'https://api.pinpdv.com.br';

const supabaseAdmin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

async function logCall(entry: {
  companyId?: string;
  action: string;
  identifier?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  httpStatus?: number;
  durationMs?: number;
  errorMessage?: string;
}) {
  try {
    await supabaseAdmin.from('pinpdv_logs').insert({
      company_id: entry.companyId ?? null,
      action: entry.action,
      identifier: entry.identifier ?? null,
      request_payload: entry.requestPayload ?? null,
      response_payload: entry.responsePayload ?? null,
      http_status: entry.httpStatus ?? null,
      duration_ms: entry.durationMs ?? null,
      error_message: entry.errorMessage ?? null,
    });
  } catch (err) {
    console.error('[PINPDV] Failed to persist log:', err);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startedAt = Date.now();
  let action = 'unknown';
  let companyId: string | undefined;
  let identifier: string | undefined;
  let requestPayloadForLog: unknown = null;

  try {
    const body = await req.json();
    action = body.action ?? 'unknown';
    companyId = body.companyId;
    const { apiToken, ...params } = body;

    if (!apiToken) {
      const resp = { success: false, errorMessage: 'Token não informado' };
      await logCall({ companyId, action, errorMessage: resp.errorMessage, httpStatus: 400, durationMs: Date.now() - startedAt });
      return new Response(JSON.stringify(resp), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const authHeaders = {
      'Authorization': `Bearer ${apiToken}`,
      'Content-Type': 'application/json',
    };

    // List available PINPDV devices
    if (action === 'list-devices') {
      const response = await fetch(`${PINPDV_BASE_URL}/pinpdv`, { method: 'GET', headers: authHeaders });
      const text = await response.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      if (!response.ok) {
        const out = { success: false, devices: [], errorMessage: `Erro: ${response.status}`, raw: parsed };
        await logCall({ companyId, action, requestPayload: { url: `${PINPDV_BASE_URL}/pinpdv` }, responsePayload: parsed, httpStatus: response.status, durationMs: Date.now() - startedAt, errorMessage: out.errorMessage });
        return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const out = { success: true, devices: parsed?.data || [] };
      await logCall({ companyId, action, requestPayload: { url: `${PINPDV_BASE_URL}/pinpdv` }, responsePayload: parsed, httpStatus: response.status, durationMs: Date.now() - startedAt });
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Create a POS TEF sale
    if (action === 'create-sale') {
      const { pinpdvId, identifier: rawIdentifier, amount, paymentType, installments, installmentType, description } = params;
      identifier = rawIdentifier;

      const sentBody: Record<string, unknown> = {
        PinPdvId: pinpdvId,
        Identificador: rawIdentifier,
        Valor: amount,
        Descricao: description || 'Venda PDV',
      };

      if (paymentType && paymentType > 0) {
        sentBody.TipoPagamento = paymentType;
        sentBody.Parcelas = installments || 1;
        // Parcelado: 1=Loja (sem juros), 2=ADM (com juros do emissor)
        if (installmentType === 'loja' || installmentType === 1) {
          sentBody.TipoParcelamento = 1;
        } else if (installmentType === 'adm' || installmentType === 2) {
          sentBody.TipoParcelamento = 2;
        }
      }

      requestPayloadForLog = sentBody;
      console.log('[PINPDV] Creating sale:', sentBody);

      const response = await fetch(`${PINPDV_BASE_URL}/pos-venda`, {
        method: 'POST',
        headers: authHeaders,
        body: JSON.stringify(sentBody),
      });

      const text = await response.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      if (!response.ok) {
        const out = { success: false, errorMessage: `Erro ao criar venda: ${response.status}`, raw: parsed };
        await logCall({ companyId, action, identifier, requestPayload: sentBody, responsePayload: parsed, httpStatus: response.status, durationMs: Date.now() - startedAt, errorMessage: out.errorMessage });
        return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      console.log('[PINPDV] Sale created:', parsed);
      const out = { success: true, posVendaId: parsed?.id, identifier: rawIdentifier, status: 'pending', raw: parsed };
      await logCall({ companyId, action, identifier, requestPayload: sentBody, responsePayload: parsed, httpStatus: response.status, durationMs: Date.now() - startedAt });
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Check sale status
    if (action === 'check-status') {
      identifier = params.identifier;
      const url = `${PINPDV_BASE_URL}/pos-venda/${identifier}`;
      const response = await fetch(url, { method: 'GET', headers: authHeaders });
      const text = await response.text();
      let data: any = null;
      try { data = JSON.parse(text); } catch { data = text; }

      if (!response.ok) {
        const out = { success: false, errorMessage: `Erro ao consultar: ${response.status}`, raw: data };
        await logCall({ companyId, action, identifier, requestPayload: { url }, responsePayload: data, httpStatus: response.status, durationMs: Date.now() - startedAt, errorMessage: out.errorMessage });
        return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const statusKey = data?.status?.key;
      let out: Record<string, unknown> = {};

      if (statusKey === 2) {
        const venda = data.vendas?.[0];
        const transacao = venda?.transacoes?.[0];

        if (venda?.status?.key === 0 && transacao?.status?.key === 0) {
          out = {
            success: true,
            status: 'approved',
            identifier: data.identificador,
            vendaIdentificador: venda.identificador,
            nsu: transacao.dados?.nsu || '',
            authorizationCode: transacao.dados?.autorizacao || '',
            cardBrand: transacao.dados?.bandeira || '',
            acquirer: transacao.dados?.adquirente || '',
            raw: data,
          };
        } else if (venda?.status?.key === 8) {
          out = { success: false, status: 'cancelled', errorMessage: 'Venda cancelada no terminal', raw: data };
        } else if (venda?.status?.key === 9) {
          out = { success: false, status: 'error', errorMessage: 'Erro na transação no terminal', raw: data };
        } else {
          out = { success: false, status: 'unknown', raw: data };
        }
      } else {
        out = { success: false, status: statusKey === 0 ? 'waiting' : statusKey === 1 ? 'processing' : 'unknown', raw: data };
      }

      await logCall({ companyId, action, identifier, requestPayload: { url }, responsePayload: data, httpStatus: response.status, durationMs: Date.now() - startedAt });
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Abort a sale
    if (action === 'abort-sale') {
      identifier = params.identifier;
      const url = params.force
        ? `${PINPDV_BASE_URL}/pos-venda/${identifier}?forca=true`
        : `${PINPDV_BASE_URL}/pos-venda/${identifier}`;

      const response = await fetch(url, { method: 'DELETE', headers: authHeaders });
      const text = await response.text();
      let parsed: any = null;
      try { parsed = JSON.parse(text); } catch { parsed = text; }

      const out = { success: response.ok, raw: parsed };
      await logCall({ companyId, action, identifier, requestPayload: { url, force: !!params.force }, responsePayload: parsed, httpStatus: response.status, durationMs: Date.now() - startedAt });
      return new Response(JSON.stringify(out), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const resp = { success: false, errorMessage: 'Ação inválida' };
    await logCall({ companyId, action, errorMessage: resp.errorMessage, httpStatus: 400, durationMs: Date.now() - startedAt });
    return new Response(JSON.stringify(resp), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });

  } catch (error) {
    console.error('[PINPDV] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    await logCall({ companyId, action, identifier, requestPayload: requestPayloadForLog, errorMessage, httpStatus: 500, durationMs: Date.now() - startedAt });
    return new Response(JSON.stringify({ success: false, errorMessage }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    });
  }
});
