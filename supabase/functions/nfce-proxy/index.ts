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

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const userId = user.id
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

    async function safeJson(resp: Response): Promise<any> {
      const text = await resp.text()
      try {
        return JSON.parse(text)
      } catch {
        console.error('[nfce-proxy] API returned non-JSON:', text.substring(0, 200))
        return { success: false, error: `API retornou resposta inválida (status ${resp.status}). Verifique a URL configurada em NFCE_API_URL.`, raw: text.substring(0, 500) }
      }
    }

    switch (action) {
      case 'emitir': {
        console.log('[nfce-proxy] Emitir NFC-e, URL:', NFCE_API_URL)
        apiResponse = await fetch(NFCE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NFCE_API_KEY,
          },
          body: JSON.stringify(payload),
        })
        result = await safeJson(apiResponse)

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
        console.log('[nfce-proxy] Consultar NFC-e:', nfceId)
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await safeJson(apiResponse)

        // Update local record with latest status from API
        if (result.success !== false && result.data) {
          const d = result.data
          const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
          }
          if (d.status) updateData.status = d.status
          if (d.numero) updateData.numero = d.numero
          if (d.serie) updateData.serie = d.serie
          if (d.chave_acesso) updateData.chave_acesso = d.chave_acesso
          if (d.protocolo) updateData.protocolo = d.protocolo
          if (d.qrcode_url) updateData.qrcode_url = d.qrcode_url
          if (d.xml_url) updateData.xml_url = d.xml_url
          if (d.motivo_rejeicao) updateData.motivo_rejeicao = d.motivo_rejeicao
          if (d.ambiente) updateData.ambiente = d.ambiente
          if (d.valor_total) updateData.valor_total = d.valor_total
          updateData.webhook_payload = result

          console.log('[nfce-proxy] Updating record with:', JSON.stringify(updateData))
          await supabase.from('nfce_records')
            .update(updateData)
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)
        }
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
        result = await safeJson(apiResponse)

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
        result = await safeJson(apiResponse)
        break
      }

      case 'xml': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/xml`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await safeJson(apiResponse)
        break
      }

      case 'danfe': {
        console.log('[nfce-proxy] Fetching DANFE for:', nfceId)
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/danfe`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        
        const contentType = apiResponse.headers.get('content-type') || ''
        console.log('[nfce-proxy] DANFE response status:', apiResponse.status, 'content-type:', contentType)
        
        if (contentType.includes('application/json')) {
          result = await safeJson(apiResponse)
        } else if (contentType.includes('application/pdf')) {
          // Return PDF as base64
          const arrayBuf = await apiResponse.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuf)
          let binary = ''
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i])
          }
          const base64 = btoa(binary)
          result = { success: apiResponse.ok, content_type: 'application/pdf', data: base64 }
        } else {
          // HTML or other text format
          const textContent = await apiResponse.text()
          result = { success: apiResponse.ok, content_type: contentType || 'text/html', html: textContent }
        }
        break
      }

      case 'listar': {
        const params = new URLSearchParams(payload || {})
        apiResponse = await fetch(`${NFCE_API_URL}?${params}`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await safeJson(apiResponse)
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
