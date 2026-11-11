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
import { resolveNfeApiUrl } from '../_shared/fiscal-api-url.ts'
import { withNfeProductCode } from '../_shared/nfe-product-code.ts'
import { canEditNfe, canDeleteNfe, nfeEventTextValid } from '../_shared/nfe-record-actions.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

function deriveNfeBaseUrl(): string {
  return resolveNfeApiUrl()
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

    const jsonResponse = (data: any, status = 200) => new Response(JSON.stringify(data), {
      status, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
    let record: any = null
    if (recordId) {
      const { data, error } = await supabase.from('nfe_records').select('*')
        .eq('id', recordId).eq('company_id', companyId).maybeSingle()
      if (error || !data) return jsonResponse({ error: 'NF-e não encontrada nesta empresa.' }, 404)
      record = data
      if (nfeId && record.nfe_id !== nfeId) return jsonResponse({ error: 'Identificador fiscal não corresponde ao registro.' }, 409)
    }
    if (action === 'excluir') {
      if (!record || !canDeleteNfe(record)) return jsonResponse({ error: 'Somente rascunhos e rejeitadas sem chave ou protocolo podem ser excluídos.' }, 409)
      const { data, error } = await supabase.from('nfe_records').delete().eq('id', recordId)
        .eq('company_id', companyId).in('status', ['rascunho', 'rejeitada'])
        .is('chave_acesso', null).is('protocolo', null).select('id')
      if (error || !data?.length) return jsonResponse({ error: 'A nota mudou de situação ou não pôde ser excluída.' }, 409)
      return jsonResponse({ success: true })
    }
    if (action === 'cancelar' && (!record || record.status !== 'autorizada' || !nfeEventTextValid(payload?.justificativa || ''))) {
      return jsonResponse({ error: 'Selecione uma NF-e autorizada e informe justificativa de 15 a 1000 caracteres.' }, 400)
    }
    if (action === 'emitir') {
      if (!record || !canEditNfe(record)) return jsonResponse({ error: 'Esta NF-e não pode ser retransmitida. Consulte a situação antes de tentar novamente.' }, 409)
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
        delete emitPayload.form
        emitPayload.external_id = record.external_id
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
              ...withNfeProductCode(it),
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
              // ICMS (Simples Nacional via CSOSN) e IPI -- obrigatórios no
              // grupo de imposto do XML da NF-e, ausentes antes desta correção.
              csosn: String(it.csosn || '102'),
              icms_origin: String(it.icms_origin ?? '0'),
              icms_aliquot: Number(it.icms_aliquot) || 0,
              ipi_cst: String(it.ipi_cst || '99'),
              ipi_aliquot: Number(it.ipi_aliquot) || 0,
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
        // Atomic claim prevents parallel transmission and blocks retry after an ambiguous timeout.
        const { data: claimed, error: claimError } = await supabase.from('nfe_records')
          .update({ status: 'pendente', request_payload: { ...emitPayload, form: payload?.form } })
          .eq('id', recordId).eq('company_id', companyId).in('status', ['rascunho', 'rejeitada'])
          .is('protocolo', null).select('id').maybeSingle()
        if (claimError || !claimed) return jsonResponse({ error: 'Transmissão já iniciada ou nota indisponível para edição.' }, 409)

        apiResponse = await fetch(NFE_API_URL, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(emitPayload),
        })
        result = await safeJson(apiResponse)

        // Persiste registro local
        const d = result?.data || result
        const authorized = apiResponse.ok && ['autorizada', 'authorized'].includes(String(d?.status || '').toLowerCase())
        const rejected = !apiResponse.ok || ['rejeitada', 'rejected'].includes(String(d?.status || '').toLowerCase())
        const insertPayload: any = {
          company_id: companyId,
          external_id: record.external_id,
          nfe_id: d?.id ? String(d.id) : null,
          numero: d?.numero ? String(d.numero) : null,
          serie: d?.serie ? String(d.serie) : (payload?.serie ? String(payload.serie) : null),
          chave_acesso: d?.chave_acesso || d?.chave || null,
          protocolo: d?.protocolo || null,
          status: authorized ? 'autorizada' : rejected ? 'rejeitada' : 'pendente',
          ambiente: d?.ambiente || payload?.ambiente || 'homologacao',
          natureza_operacao: payload?.natureza_operacao || null,
          finalidade: Number(payload?.finalidade ?? 1),
          valor_total: Number(emitPayload.valor_total || 0),
          destinatario: payload?.destinatario || null,
          motivo_rejeicao: apiResponse.ok ? null : (d?.message || d?.error || result?.error || 'Erro'),
          request_payload: { ...emitPayload, form: payload?.form },
          response_payload: result,
          created_by: user.id,
        }
        const { data: inserted, error: persistenceError } = await supabase
          .from('nfe_records')
          .update(insertPayload).eq('id', recordId).eq('company_id', companyId).eq('status', 'pendente')
          .select('id')
          .single()

        if (persistenceError || !inserted) return jsonResponse({ error: 'O retorno fiscal não pôde ser salvo. Consulte a nota; não repita a transmissão.' }, 409)
        return new Response(JSON.stringify({ ok: authorized, pending: !authorized && !rejected, recordId: inserted?.id, result, error: rejected ? insertPayload.motivo_rejeicao : undefined }), {
          // Fiscal rejection is a domain result; auth/configuration errors keep their HTTP status.
          status: 200,
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
        const text = await apiResponse.text()
        if (text.trim().startsWith('<')) result = { xml: text }
        else {
          try { result = JSON.parse(text) }
          catch { result = { error: 'XML autorizado não disponível.' } }
        }
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
        const cancelData = result?.data || result
        const cancelConfirmed = apiResponse.ok && result?.success !== false && !result?.error
          && (['cancelada', 'cancelado', 'cancelled', 'canceled'].includes(String(cancelData?.status || '').toLowerCase())
            || ['135', '155'].includes(String(cancelData?.cStat || '')))
        if (cancelConfirmed && recordId) {
          await supabase.from('nfe_records').update({
            status: 'cancelada', webhook_payload: { ...(record.webhook_payload || {}), cancelamento: result },
          }).eq('id', recordId).eq('company_id', companyId).eq('status', 'autorizada')
        }
        if (apiResponse.ok && !cancelConfirmed) return jsonResponse({ success: false, error: 'Cancelamento não confirmado pelo serviço fiscal. Consulte a situação da NF-e antes de repetir.' })
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