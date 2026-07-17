// Edge function: nfce-contingencia-sync
// Roda periodicamente (via pg_cron) e sincroniza automaticamente notas
// emitidas em contingência offline que ainda não foram efetivadas na SEFAZ.
// Consulta a Focus NFe para cada nota pendente e atualiza os campos
// `contingencia_efetivada`, `status`, `protocolo` etc no banco.
//
// Assim, mesmo que ninguém abra o NFCeMonitor no navegador, as notas em
// contingência são reconciliadas com a SEFAZ automaticamente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function buildQrcodeUrl(chave: string, ambiente: string): string | null {
  if (!chave || chave.length !== 44) return null
  const uf = chave.substring(0, 2)
  const base = ambiente === 'producao'
    ? `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx`
    : `https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx`
  return `${base}?chNFe=${chave}&tpAmb=${ambiente === 'producao' ? '1' : '2'}`
}

function pickExternalIdMatch(result: any, externalId: string): any | null {
  const top = result?.data ?? result
  if (Array.isArray(top)) {
    return top.find((item: any) =>
      String(item?.external_id || item?.externalId || item?.id_externo || item?.idExterno || '') === externalId
    ) || null
  }
  if (top && typeof top === 'object') {
    const returnedExternalId = top.external_id || top.externalId || top.id_externo || top.idExterno
    if (returnedExternalId && String(returnedExternalId) !== externalId) return null
    return top
  }
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const NFCE_API_URL = Deno.env.get('NFCE_API_URL')
    const GLOBAL_NFCE_API_KEY = Deno.env.get('NFCE_API_KEY') ?? null
    if (!NFCE_API_URL) {
      return new Response(JSON.stringify({ error: 'NFCE_API_URL ausente' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    // Busca notas em contingência ainda não efetivadas (limite defensivo)
    const { data: pending, error: qErr } = await supabase
      .from('nfce_records')
      .select('id, company_id, nfce_id, ambiente')
      .eq('contingencia_offline', true)
      .eq('contingencia_efetivada', false)
      .not('nfce_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(100)

    if (qErr) {
      console.error('[nfce-contingencia-sync] Query error:', qErr)
      return new Response(JSON.stringify({ error: qErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (pending && pending.length > 0) {
      console.log(`[nfce-contingencia-sync] Verificando ${pending.length} notas em contingência`)
    } else {
      console.log('[nfce-contingencia-sync] Nenhuma contingência pendente; verificando órfãs mesmo assim')
    }

    // Reconciliação de ÓRFÃS: notas em 'processando' que ficaram sem
    // nfce_id local (timeout do proxy sem gravar o id retornado pela FF).
    // Buscamos pela chave (company_id, external_id) e consultamos a Fiscal
    // Flow para recuperar o id/chave/status. Apenas UPDATE — não emite.
    const { data: orphans } = await supabase
      .from('nfce_records')
      .select('id, company_id, external_id, ambiente')
      .is('nfce_id', null)
      .not('external_id', 'is', null)
      .in('status', ['processando', 'pendente'])
      .order('created_at', { ascending: false })
      .limit(50)

    if (orphans && orphans.length > 0) {
      console.log(`[nfce-contingencia-sync] ${orphans.length} órfãs para reconciliar`)
    }

    // Cache de token por empresa para não consultar store_settings repetidas vezes
    const tokenCache = new Map<string, string | null>()
    async function tokenFor(companyId: string): Promise<string | null> {
      if (tokenCache.has(companyId)) return tokenCache.get(companyId)!
      const { data } = await supabase
        .from('store_settings')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', 'fiscal_flow_api_token')
        .maybeSingle()
      const perCompany = (data?.value || '').trim()
      const resolved = perCompany || GLOBAL_NFCE_API_KEY
      tokenCache.set(companyId, resolved)
      return resolved
    }

    let effected = 0
    let errors = 0
    let reconciled = 0

    const FF_BASE_URL = NFCE_API_URL.replace(/\/emitir\/?$/i, '').replace(/\/+$/, '')

    async function consultarPorExternalId(apiKey: string, externalId: string): Promise<any | null> {
      const encoded = encodeURIComponent(externalId)
      const attempts = [
        `${NFCE_API_URL}?external_id=${encoded}`,
        `${FF_BASE_URL}/nfce-api/consultar?external_id=${encoded}`,
      ]

      for (const url of attempts) {
        const resp = await fetch(url, { headers: { 'x-api-key': apiKey, 'Accept': 'application/json' } })
        const text = await resp.text()
        let result: any = null
        try { result = JSON.parse(text) } catch { result = null }
        const match = pickExternalIdMatch(result, externalId)
        console.log('[nfce-contingencia-sync] consulta external_id status=', resp.status, 'match=', Boolean(match))
        if (match) return match
      }

      return null
    }

    for (const record of (orphans || [])) {
      try {
        const apiKey = await tokenFor(record.company_id)
        if (!apiKey) continue
        const d = await consultarPorExternalId(apiKey, record.external_id!) || {}
        const remoteId = d?.id || d?.nfce_id || null
        if (!remoteId && !d?.chave_acesso) continue

        const chave = d.chave_acesso || d.chave || d.access_key || null
        const proto = d.protocolo || d.protocol || d.nProt || null
        const rawStatus = (d.status || d.situacao || 'processando').toString().toLowerCase()
        const qr = d.qrcode_url || d.qr_code_url || d.url_qrcode || d.qrcode || d.qr_code || null
        const builtQr = qr || (chave ? buildQrcodeUrl(chave, record.ambiente || 'producao') : null)

        const upd: Record<string, any> = {
          nfce_id: remoteId,
          status: rawStatus.includes('autoriz') ? 'autorizada' : rawStatus,
          chave_acesso: chave,
          protocolo: proto,
          qrcode_url: builtQr,
          xml_url: d.xml_url || d.url_xml || null,
          webhook_payload: { recovered_from: 'contingencia-sync-orphan', response: d },
          updated_at: new Date().toISOString(),
        }
        const { error: upErr } = await supabase
          .from('nfce_records')
          .update(upd)
          .eq('id', record.id)
          .is('nfce_id', null)
        if (upErr) errors++
        else {
          reconciled++
          console.log(`[nfce-contingencia-sync] Órfã reconciliada: ${record.id} → nfce_id=${remoteId} status=${upd.status}`)
        }
      } catch (err) {
        console.error('[nfce-contingencia-sync] Erro órfã', record.id, err)
        errors++
      }
    }

    for (const record of (pending || [])) {
      try {
        const apiKey = await tokenFor(record.company_id)
        if (!apiKey) {
          console.warn('[nfce-contingencia-sync] sem token para company', record.company_id)
          continue
        }

        const resp = await fetch(`${NFCE_API_URL}/${record.nfce_id}`, {
          headers: { 'x-api-key': apiKey },
        })
        const text = await resp.text()
        let result: any
        try { result = JSON.parse(text) } catch { result = { raw: text.substring(0, 300) } }

        const d = result?.data || result
        if (!d) continue

        const updateData: Record<string, any> = {
          updated_at: new Date().toISOString(),
          webhook_payload: result,
        }

        const rawStatus = d.status || d.situacao || d.situation
        if (rawStatus) updateData.status = rawStatus

        const proto = d.protocolo || d.protocol || d.nProt
        if (proto) updateData.protocolo = proto

        const chave = d.chave_acesso || d.chave || d.access_key || d.chnfe
        if (chave) updateData.chave_acesso = chave

        const qr = d.qrcode_url || d.qr_code_url || d.url_qrcode || d.qrcode || d.qr_code || d.url_consulta_qrcode
        const chaveForQr = updateData.chave_acesso || chave
        if (qr) updateData.qrcode_url = qr
        else if (chaveForQr) {
          const builtQr = buildQrcodeUrl(chaveForQr, record.ambiente || 'homologacao')
          if (builtQr) updateData.qrcode_url = builtQr
        }

        const xml = d.xml_url || d.url_xml || d.xml
        if (xml) updateData.xml_url = xml

        if (d.contingencia_offline_efetivada === true || d.contingencia_efetivada === true) {
          updateData.contingencia_efetivada = true
          effected++
          console.log(`[nfce-contingencia-sync] Nota ${record.nfce_id} EFETIVADA na SEFAZ`)
        }

        // Se a Focus já retorna a nota com protocolo REAL da SEFAZ (autorizada
        // ou cancelada), a contingência foi transmitida com sucesso — mesmo
        // que o campo `contingencia_offline_efetivada` não venha (ex.: notas
        // já canceladas depois da efetivação). Protocolo SEFAZ é numérico e
        // tem ~15 dígitos; usamos essa heurística para não deixar a flag
        // amarela presa indefinidamente.
        const protoStr = (proto ? String(proto) : '').trim()
        const hasRealSefazProto = /^\d{10,}$/.test(protoStr)
        const finalStatus = (updateData.status || rawStatus || '').toLowerCase()
        if (hasRealSefazProto && (finalStatus === 'autorizada' || finalStatus === 'cancelada')) {
          if (updateData.contingencia_efetivada !== true) {
            updateData.contingencia_efetivada = true
            effected++
            console.log(`[nfce-contingencia-sync] Nota ${record.nfce_id} EFETIVADA (via protocolo SEFAZ, status=${finalStatus})`)
          }
        }

        // Caso o retry em contingência não tenha sido necessário e a SEFAZ
        // tenha autorizado em modo NORMAL (tpEmis=1), limpa a flag de
        // contingência para não deixar a nota presa com o selo amarelo.
        const xmlRetorno: string | undefined =
          d.xml_retorno || d.xml_nfe || d.xml || (typeof xml === 'string' ? xml : undefined)
        const autorizadaNormal =
          rawStatus === 'autorizada' &&
          typeof xmlRetorno === 'string' &&
          /<tpEmis>\s*1\s*<\/tpEmis>/.test(xmlRetorno)
        if (autorizadaNormal) {
          updateData.contingencia_offline = false
          updateData.contingencia_efetivada = false
          console.log(`[nfce-contingencia-sync] Nota ${record.nfce_id} autorizada em modo NORMAL — limpando flag de contingência`)
        }

        const { error: upErr } = await supabase
          .from('nfce_records')
          .update(updateData)
          .eq('id', record.id)

        if (upErr) {
          console.error('[nfce-contingencia-sync] Update error:', record.nfce_id, upErr)
          errors++
        }
      } catch (err) {
        console.error('[nfce-contingencia-sync] Erro em', record.nfce_id, err)
        errors++
      }
    }

    return new Response(
      JSON.stringify({ ok: true, checked: pending?.length ?? 0, effected, reconciled, errors }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (err) {
    console.error('[nfce-contingencia-sync] Erro inesperado:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})