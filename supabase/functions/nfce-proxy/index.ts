import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const token = authHeader.replace('Bearer ', '')
    const { data: authData, error: authError } = await supabase.auth.getClaims(token)
    if (authError || !authData?.claims) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const userId = authData.claims.sub
    const NFCE_API_KEY = Deno.env.get('NFCE_API_KEY')
    const NFCE_API_URL = Deno.env.get('NFCE_API_URL')

    if (!NFCE_API_KEY || !NFCE_API_URL) {
      return new Response(JSON.stringify({ error: 'NFC-e API não configurada' }), { status: 500, headers: corsHeaders })
    }

    const body = await req.json()
    const { action, companyId, saleId, nfceId, payload } = body

    // Verify user belongs to company
    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: userId,
      _company_id: companyId
    })
    if (!belongs) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: corsHeaders })
    }

    let apiResponse: Response
    let result: any

    switch (action) {
      case 'emitir': {
        // Emit NFC-e
        apiResponse = await fetch(NFCE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NFCE_API_KEY,
          },
          body: JSON.stringify(payload),
        })
        result = await apiResponse.json()

        // Save record
        if (result.success && result.data) {
          await supabase.from('nfce_records').insert({
            company_id: companyId,
            sale_id: saleId || null,
            external_id: payload.external_id,
            nfce_id: result.data.id,
            numero: result.data.numero,
            serie: result.data.serie,
            status: result.data.status || 'pendente',
            ambiente: result.data.ambiente || 'homologacao',
            valor_total: result.data.valor_total || 0,
            request_payload: payload,
            response_payload: result,
          })
        }
        break
      }

      case 'consultar': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await apiResponse.json()
        break
      }

      case 'cancelar': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/cancelar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NFCE_API_KEY,
          },
          body: JSON.stringify({ justificativa: payload?.justificativa }),
        })
        result = await apiResponse.json()

        if (result.success) {
          await supabase.from('nfce_records')
            .update({ status: 'cancelada', updated_at: new Date().toISOString() })
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)
        }
        break
      }

      case 'reprocessar': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/reprocessar`, {
          method: 'POST',
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await apiResponse.json()
        break
      }

      case 'xml': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/xml`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await apiResponse.json()
        break
      }

      case 'listar': {
        const params = new URLSearchParams(payload || {})
        apiResponse = await fetch(`${NFCE_API_URL}?${params}`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await apiResponse.json()
        break
      }

      default:
        return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify(result), {
      status: apiResponse!.ok ? 200 : apiResponse!.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[nfce-proxy] Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
