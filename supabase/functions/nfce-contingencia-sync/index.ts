// Edge function: nfce-contingencia-sync
// Roda periodicamente (via pg_cron) e sincroniza automaticamente notas
// emitidas em contingência offline que ainda não foram efetivadas na SEFAZ.
// Consulta a Focus NFe para cada nota pendente e atualiza os campos
// `contingencia_efetivada`, `status`, `protocolo` etc no banco.
//
// Assim, mesmo que ninguém abra o NFCeMonitor no navegador, as notas em
// contingência são reconciliadas com a SEFAZ automaticamente.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { fiscalFlowBaseFromNfceUrl, resolveNfceApiUrl } from '../_shared/fiscal-api-url.ts'
import { buildNfceFiscalFields } from '../_shared/nfce-fiscal-fields.ts'

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

// Extrai NSU/autorização/bandeira do texto livre salvo em pdv_sales.notes
// (ex.: "NSU:564726288 | Aut 564726288 | PIX | SICREDI"). Best-effort: se
// não achar NSU+autorização, devolve null e a venda é emitida sem o bloco
// `tef` detalhado (ainda válida, só sem o rastro de NSU/bandeira).
function parseTefFromNotes(notes: string | null | undefined, amount: number): Record<string, unknown> | null {
  if (!notes) return null
  const nsuMatch = notes.match(/NSU:?\s*(\d{4,})/i)
  const autMatch = notes.match(/\bAut:?\s*(\d{4,})/i)
  if (!nsuMatch || !autMatch) return null
  const upper = notes.toUpperCase()
  let tipo_pagamento: 'credit' | 'debit' | 'pix' = 'credit'
  if (upper.includes('PIX')) tipo_pagamento = 'pix'
  else if (upper.includes('DEBITO') || upper.includes('DÉBITO')) tipo_pagamento = 'debit'
  const brands = ['VISA', 'MASTERCARD', 'ELO', 'AMEX', 'HIPERCARD', 'SICREDI', 'CABAL', 'BANRICOMPRAS']
  const bandeira = brands.find((b) => upper.includes(b)) || (tipo_pagamento === 'pix' ? 'PIX' : 'CARTAO')
  return { nsu: nsuMatch[1], autorizacao: autMatch[1], bandeira, tipo_pagamento, valor: amount }
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
    const NFCE_API_URL = resolveNfceApiUrl()
    const GLOBAL_NFCE_API_KEY = Deno.env.get('NFCE_API_KEY') ?? null

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

    // Notas com nfce_id mas presas em processando/pendente (>5 min) — consulta VPS
    const corteStuck = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    const { data: stuckWithId } = await supabase
      .from('nfce_records')
      .select('id, company_id, nfce_id, external_id, ambiente, status')
      .not('nfce_id', 'is', null)
      .in('status', ['processando', 'pendente'])
      .lt('updated_at', corteStuck)
      .order('updated_at', { ascending: true })
      .limit(80)

    if (stuckWithId && stuckWithId.length > 0) {
      console.log(`[nfce-contingencia-sync] ${stuckWithId.length} presas com nfce_id para sincronizar`)
    }

    let stuckSynced = 0

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

    const FF_BASE_URL = fiscalFlowBaseFromNfceUrl(NFCE_API_URL)

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

    for (const record of (stuckWithId || [])) {
      try {
        const apiKey = await tokenFor(record.company_id)
        if (!apiKey) continue
        const resp = await fetch(`${NFCE_API_URL}/${record.nfce_id}`, {
          headers: { 'x-api-key': apiKey },
        })
        const text = await resp.text()
        let result: any
        try { result = JSON.parse(text) } catch { continue }
        const d = result?.data || result
        if (!d?.status) continue
        const rawStatus = String(d.status || '').toLowerCase()
        const chave = d.chave_acesso || d.chave || d.access_key || null
        const upd: Record<string, any> = {
          status: rawStatus.includes('autoriz') ? 'autorizada' : rawStatus,
          chave_acesso: chave,
          protocolo: d.protocolo || d.protocol || d.nProt || null,
          qrcode_url: d.qrcode_url || d.qr_code_url || (chave ? buildQrcodeUrl(chave, record.ambiente || 'producao') : null),
          xml_url: d.xml_url || d.url_xml || null,
          ambiente: record.ambiente || 'producao',
          updated_at: new Date().toISOString(),
          webhook_payload: { recovered_from: 'contingencia-sync-stuck', response: d },
        }
        if (rawStatus === 'rejeitada') {
          upd.motivo_rejeicao = d.motivo_rejeicao || d.motivo || d.motivo_retorno || d.erro || null
        }
        const { error: upErr } = await supabase.from('nfce_records').update(upd).eq('id', record.id)
        if (!upErr) {
          stuckSynced++
          console.log(`[nfce-contingencia-sync] Presa sincronizada: ${record.external_id?.slice(0, 30)} → ${upd.status}`)
        } else errors++
      } catch (err) {
        console.error('[nfce-contingencia-sync] Erro presa', record.id, err)
        errors++
      }
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

    // ── Auto-emissão de vendas "fiscal" órfãs (sem nenhuma tentativa) ───────
    // Caso real (12/11/2026, Cozinha da Ruiva): a tela ficou com código
    // antigo em cache e salvou 2 vendas com TEF como pdv_sales.fiscal_mode=
    // 'nao_fiscal' (a trava de banco -- migração trava_tef_fiscal_mode --
    // corrige esse rótulo sozinha). Mesmo corrigido o rótulo, se a tela
    // nunca chegou a chamar o nfce-proxy (aba fechada, erro de JS antes da
    // chamada etc.), a venda fica "fiscal" pra sempre sem nota. Esta seção
    // fecha esse ciclo: procura vendas 'fiscal' com mais de 3 min, sem
    // NENHUM nfce_records e sem cancelamento, monta o mesmo payload que a
    // Frente de Caixa montaria, e chama o nfce-proxy (via x-admin-secret)
    // reaproveitando toda a normalização/idempotência que já existe lá.
    // external_id = FCX-<saleId> (mesmo esquema do frontend) garante que,
    // se a tela e este job correrem ao mesmo tempo, o nfce-proxy devolve o
    // registro já criado em vez de duplicar.
    let autoEmitted = 0
    let autoEmitErrors = 0
    try {
      const cutoff = new Date(Date.now() - 3 * 60 * 1000).toISOString()
      const { data: candidateSales } = await supabase
        .from('pdv_sales')
        .select('id, company_id, discount, customer_name, notes, created_at')
        .eq('fiscal_mode', 'fiscal')
        .lt('created_at', cutoff)
        .order('created_at', { ascending: false })
        .limit(30)

      if (candidateSales && candidateSales.length > 0) {
        const saleIds = candidateSales.map((s) => s.id)

        const { data: existingNfce } = await supabase
          .from('nfce_records')
          .select('sale_id')
          .in('sale_id', saleIds)
        const idsComNfce = new Set((existingNfce || []).map((r: any) => r.sale_id))

        const { data: cancelled } = await supabase
          .from('pdv_sale_cancellations')
          .select('sale_id')
          .in('sale_id', saleIds)
        const idsCancelados = new Set((cancelled || []).map((r: any) => r.sale_id))

        const orfas = candidateSales.filter((s) => !idsComNfce.has(s.id) && !idsCancelados.has(s.id))

        if (orfas.length > 0) {
          console.log(`[nfce-contingencia-sync] ${orfas.length} venda(s) fiscal(is) órfã(s) (sem nenhuma tentativa de NFC-e)`)
        }

        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
        const ADMIN_SECRET = Deno.env.get('NFCE_WEBHOOK_SECRET') ?? ''

        for (const sale of orfas) {
          try {
            const { data: items } = await supabase
              .from('pdv_sale_items')
              .select('product_id, product_name, quantity, unit_price, total_price')
              .eq('sale_id', sale.id)

            if (!items || items.length === 0) {
              console.warn('[nfce-contingencia-sync] venda órfã sem itens, pulando:', sale.id)
              continue
            }

            const productIds = items.map((i: any) => i.product_id).filter(Boolean)
            const { data: products } = productIds.length
              ? await supabase.from('products').select('id, ncm, cest, code, unit, tax_rule_id').in('id', productIds)
              : { data: [] }
            const productsById = new Map((products || []).map((p: any) => [p.id, p]))

            const taxRuleIds = (products || []).map((p: any) => p.tax_rule_id).filter(Boolean)
            const { data: taxRules } = taxRuleIds.length
              ? await supabase.from('tax_rules').select('id, ncm, cfop, cest, csosn, icms_aliquot, pis_cst, pis_aliquot, cofins_cst, cofins_aliquot').in('id', taxRuleIds)
              : { data: [] }
            const taxRulesById = new Map((taxRules || []).map((t: any) => [t.id, t]))

            const nfceItems = items.map((it: any) => {
              const product = it.product_id ? productsById.get(it.product_id) : null
              const taxRule = product?.tax_rule_id ? taxRulesById.get(product.tax_rule_id) : null
              const fallbackNcm = it.product_id ? '00000000' : '21069090'
              const unitNet = Number(it.quantity) > 0 ? Number(it.total_price) / Number(it.quantity) : Number(it.unit_price)
              return {
                codigo: product?.code || it.product_id || 'AVULSO',
                descricao: it.product_name,
                unidade: product?.unit || 'UN',
                quantidade: Number(it.quantity),
                valor_unitario: Math.round(unitNet * 100) / 100,
                ...buildNfceFiscalFields({ product, taxRule, mercadoEnabled: true, fallbackNcm }),
              }
            })

            const { data: payments } = await supabase
              .from('pdv_sale_payments')
              .select('amount, integration, payment_method_name')
              .eq('sale_id', sale.id)

            const pagamentosSplit = (payments || []).map((p: any) => {
              const isTef = p.integration === 'tef_pinpad' || p.integration === 'tef_smartpos'
              if (!isTef) return { tipo: 'cash', valor: Number(p.amount) }
              const tef = parseTefFromNotes(sale.notes, Number(p.amount))
              return tef ? { tipo: 'tef', valor: Number(p.amount), tef } : { tipo: 'tef', valor: Number(p.amount) }
            })

            const payload = {
              external_id: `FCX-${sale.id}`,
              itens: nfceItems,
              valor_desconto: Number(sale.discount) || 0,
              valor_frete: 0,
              observacoes: sale.customer_name ? `Cliente: ${sale.customer_name}` : undefined,
              pagamentos_split: pagamentosSplit,
            }

            const resp = await fetch(`${SUPABASE_URL}/functions/v1/nfce-proxy`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'x-admin-secret': ADMIN_SECRET },
              body: JSON.stringify({ action: 'emitir', companyId: sale.company_id, saleId: sale.id, payload }),
            })
            const result = await resp.json().catch(() => null)
            if (resp.ok && result?.success !== false) {
              autoEmitted++
              console.log(`[nfce-contingencia-sync] Venda órfã emitida: ${sale.id} (company ${sale.company_id})`)
            } else {
              autoEmitErrors++
              console.error(`[nfce-contingencia-sync] Falha ao emitir venda órfã ${sale.id}:`, resp.status, result)
            }
          } catch (err) {
            autoEmitErrors++
            console.error('[nfce-contingencia-sync] Erro processando venda órfã', sale.id, err)
          }
        }
      }
    } catch (err) {
      console.error('[nfce-contingencia-sync] Erro na varredura de vendas fiscais órfãs:', err)
    }

    return new Response(
      JSON.stringify({ ok: true, checked: pending?.length ?? 0, effected, reconciled, stuckSynced, autoEmitted, autoEmitErrors, errors }),
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