// Edge function: nfe-proxy
// Proxy isolado da Fiscal Flow para NF-e (modelo 55). NÃO compartilha código
// com `nfce-proxy` — foi clonado em estrutura mínima para garantir que
// alterações aqui não impactem o fluxo de NFC-e que está estável.
//
// Fase 1: ações `emitir`, `consultar`, `xml`, `danfe`, `cancelar`.
// Usa o MESMO token Fiscal Flow já salvo em `store_settings.fiscal_flow_api_token`
// (e cai no global `NFCE_API_KEY` quando ausente). A URL é derivada de
// `NFE_API_URL` (preferencial) ou de `NFCE_API_URL` trocando `/nfce` por `/nfe`.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function deriveNfeBaseUrl(): string | null {
  const explicit = Deno.env.get('NFE_API_URL')
  if (explicit) return explicit.replace(/\/$/, '')
  const nfce = Deno.env.get('NFCE_API_URL')
  if (!nfce) return null
  // Substitui o segmento /nfce por /nfe preservando host e demais segmentos.
  const url = nfce.replace(/\/$/, '')
  if (url.includes('/nfce')) return url.replace('/nfce', '/nfe')
  return url + '/nfe'
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const NFE_API_URL = deriveNfeBaseUrl()
    if (!NFE_API_URL) {
      return new Response(
        JSON.stringify({ error: 'NF-e API não configurada (URL ausente)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const body = await req.json()
    const { action, companyId, nfeId, recordId, payload } = body as {
      action: string
      companyId: string
      nfeId?: string
      recordId?: string
      payload?: any
    }

    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: user.id,
      _company_id: companyId,
    })
    if (!belongs) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Token por empresa (mesmo da NFC-e); fallback global
    let NFE_API_KEY: string | null = Deno.env.get('NFCE_API_KEY') ?? null
    const { data: tokenRow } = await supabase
      .from('store_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'fiscal_flow_api_token')
      .maybeSingle()
    const perCompanyToken = (tokenRow?.value || '').trim()
    if (perCompanyToken) NFE_API_KEY = perCompanyToken

    if (!NFE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Token Fiscal Flow ausente. Configure em Fiscal → Token da API.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const apiHeaders = {
      'x-api-key': NFE_API_KEY,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    async function safeJson(resp: Response): Promise<any> {
      const text = await resp.text()
      try { return JSON.parse(text) } catch {
        return { success: false, error: `API retornou resposta inválida (status ${resp.status})`, raw: text.substring(0, 500) }
      }
    }

    let apiResponse: Response
    let result: any

    switch (action) {
      case 'emitir': {
        const emitPayload = { ...payload }
        // Normalização básica de itens (mesmo padrão da NFC-e)
        if (Array.isArray(emitPayload.itens)) {
          const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
          const money = (n: number) => round2(n).toFixed(2)
          const qty = (n: number) => (Number(n) || 0).toFixed(4)
          emitPayload.itens = emitPayload.itens.map((it: any) => {
            const qtd = Number(it.quantidade) || 0
            const vUnit = round2(Number(it.valor_unitario) || 0)
            const vTot = round2(qtd * vUnit)
            const fixCst = (cst: string, aliq: number) =>
              (cst === '49' || cst === '99') && (!aliq || aliq === 0) ? '07' : cst
            const cestRaw = (it.cest ?? '').toString().replace(/\D/g, '')
            const cestField = cestRaw.length === 7 ? { cest: cestRaw } : {}
            return {
              ...it,
              ...cestField,
              quantidade: qtd,
              qCom: qty(qtd),
              qTrib: qty(qtd),
              valor_unitario: vUnit,
              vUnCom: money(vUnit),
              vUnTrib: money(vUnit),
              valor_total: vTot,
              vProd: money(vTot),
              cst_pis: fixCst(String(it.cst_pis || '49'), Number(it.aliquota_pis) || 0),
              cst_cofins: fixCst(String(it.cst_cofins || '49'), Number(it.aliquota_cofins) || 0),
              aliquota_pis: Number(it.aliquota_pis) || 0,
              aliquota_cofins: Number(it.aliquota_cofins) || 0,
            }
          })
          const subtotal = emitPayload.itens.reduce(
            (s: number, it: any) => s + (Number(it.valor_total) || 0), 0)
          const desconto = round2(Number(emitPayload.valor_desconto) || 0)
          const frete = round2(Number(emitPayload.valor_frete) || 0)
          emitPayload.valor_total = round2(subtotal - desconto + frete)
        }

        // Garantir modelo 55 (NF-e). Algumas Fiscal Flow exigem mod=55 explícito.
        emitPayload.modelo = '55'
        emitPayload.mod = '55'

        console.log('[nfe-proxy] Emitir NF-e, URL:', NFE_API_URL)
        console.log('[nfe-proxy] payload:', JSON.stringify(emitPayload).substring(0, 1500))

        apiResponse = await fetch(NFE_API_URL, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(emitPayload),
        })
        result = await safeJson(apiResponse)

        // Persiste registro local
        const d = result?.data || result
        const externalId = String(d?.id || d?.nfe_id || d?.external_id || crypto.randomUUID())
        const insertPayload: any = {
          company_id: companyId,
          external_id: externalId,
          nfe_id: d?.id ? String(d.id) : null,
          numero: d?.numero ? String(d.numero) : null,
          serie: d?.serie ? String(d.serie) : (payload?.serie ? String(payload.serie) : null),
          chave_acesso: d?.chave_acesso || d?.chave || null,
          protocolo: d?.protocolo || null,
          status: apiResponse.ok ? (d?.status || 'autorizada') : 'rejeitada',
          ambiente: d?.ambiente || payload?.ambiente || 'homologacao',
          natureza_operacao: payload?.natureza_operacao || null,
          finalidade: Number(payload?.finalidade ?? 1),
          valor_total: Number(emitPayload.valor_total || 0),
          destinatario: payload?.destinatario || null,
          motivo_rejeicao: apiResponse.ok ? null : (d?.message || d?.error || result?.error || 'Erro'),
          request_payload: emitPayload,
          response_payload: result,
          created_by: user.id,
        }
        const { data: inserted } = await supabase
          .from('nfe_records')
          .insert(insertPayload)
          .select('id')
          .single()

        return new Response(JSON.stringify({ ok: apiResponse.ok, recordId: inserted?.id, result }), {
          status: apiResponse.ok ? 200 : 422,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'consultar': {
        if (!nfeId) return new Response(JSON.stringify({ error: 'nfeId obrigatório' }), { status: 400, headers: corsHeaders })
        apiResponse = await fetch(`${NFE_API_URL}/${nfeId}`, { headers: apiHeaders })
        result = await safeJson(apiResponse)
        return new Response(JSON.stringify(result), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'xml': {
        if (!nfeId) return new Response(JSON.stringify({ error: 'nfeId obrigatório' }), { status: 400, headers: corsHeaders })
        apiResponse = await fetch(`${NFE_API_URL}/${nfeId}/xml`, { headers: apiHeaders })
        result = await safeJson(apiResponse)
        return new Response(JSON.stringify(result), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'danfe': {
        if (!nfeId) return new Response(JSON.stringify({ error: 'nfeId obrigatório' }), { status: 400, headers: corsHeaders })
        apiResponse = await fetch(`${NFE_API_URL}/${nfeId}/danfe`, { headers: apiHeaders })
        result = await safeJson(apiResponse)
        return new Response(JSON.stringify(result), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'cancelar': {
        if (!nfeId) return new Response(JSON.stringify({ error: 'nfeId obrigatório' }), { status: 400, headers: corsHeaders })
        apiResponse = await fetch(`${NFE_API_URL}/${nfeId}/cancelar`, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({ justificativa: payload?.justificativa || '' }),
        })
        result = await safeJson(apiResponse)
        if (apiResponse.ok && recordId) {
          await supabase.from('nfe_records').update({
            status: 'cancelada', response_payload: result,
          }).eq('id', recordId)
        }
        return new Response(JSON.stringify(result), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
  } catch (err) {
    console.error('[nfe-proxy] erro inesperado:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})