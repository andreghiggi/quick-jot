import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

const FF_BASE = 'https://vdzkhealunurfgrujekg.supabase.co/functions/v1/dfe-api'

function j(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) return j({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return j({ error: 'Unauthorized' }, 401)

    const body = await req.json().catch(() => ({}))
    const { action, companyId } = body as { action: string; companyId: string }
    if (!action || !companyId) return j({ error: 'action e companyId obrigatórios' }, 400)

    // multi-tenancy
    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: user.id, _company_id: companyId,
    })
    if (!belongs) return j({ error: 'Acesso negado' }, 403)

    // FiscalFlow identifica a empresa pelo próprio token (x-api-key).
    // Não enviamos mais empresa_id (UUID) — basta o token configurado por loja.
    const { data: tokRow } = await admin
      .from('store_settings').select('value')
      .eq('company_id', companyId).eq('key', 'fiscal_flow_api_token').maybeSingle()
    const token = (tokRow?.value || '').trim()
    if (!token) return j({ error: 'Token FiscalFlow não configurado em Integrações.' }, 400)

    const ffHeaders = { 'x-api-key': token, 'Content-Type': 'application/json' }

    // ---------- SYNC (loop até esgotar) ----------
    if (action === 'sync') {
      let total = 0, ultimoNsu: number | null = null, maxNsu: number | null = null
      for (let i = 0; i < 30; i++) {
        const r = await fetch(`${FF_BASE}/sync`, {
          method: 'POST', headers: ffHeaders,
          body: JSON.stringify({}),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok || !data?.success) {
          return j({ error: data?.error || 'Falha na sincronização', detail: data }, 502)
        }
        total += Number(data.data?.docs_processados || 0)
        ultimoNsu = data.data?.ultimo_nsu ?? ultimoNsu
        maxNsu = data.data?.max_nsu ?? maxNsu
        if (Number(data.data?.docs_processados || 0) === 0) break
        if (ultimoNsu != null && maxNsu != null && ultimoNsu >= maxNsu) break
      }
      // Buscar lista pra espelhar no banco local
      await mirrorList(admin, ffHeaders, companyId)
      return j({ success: true, total_processados: total, ultimo_nsu: ultimoNsu, max_nsu: maxNsu })
    }

    // ---------- MIRROR (refresh lista local sem chamar /sync) ----------
    if (action === 'mirror') {
      const count = await mirrorList(admin, ffHeaders, companyId)
      return j({ success: true, mirrored: count })
    }

    // ---------- MANIFESTAR ----------
    if (action === 'manifestar') {
      const { documentoId, tipo, justificativa } = body as {
        documentoId: string; tipo: string; justificativa?: string
      }
      if (!documentoId || !tipo) return j({ error: 'documentoId e tipo obrigatórios' }, 400)
      const { data: doc } = await admin.from('dfe_documentos')
        .select('id, company_id, fiscalflow_id, chave_acesso')
        .eq('id', documentoId).maybeSingle()
      if (!doc || doc.company_id !== companyId) return j({ error: 'Documento não encontrado' }, 404)
      if (!doc.fiscalflow_id) return j({ error: 'fiscalflow_id ausente neste documento (sincronize antes)' }, 400)

      const r = await fetch(`${FF_BASE}/${doc.fiscalflow_id}/manifestar`, {
        method: 'POST', headers: ffHeaders,
        body: JSON.stringify({ tipo, justificativa: justificativa || '' }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data?.success) {
        return j({ error: data?.error || 'Falha ao manifestar', detail: data }, 502)
      }
      const statusMap: Record<string, string> = {
        ciencia: 'ciente', confirmacao: 'confirmada',
        desconhecimento: 'desconhecida', nao_realizada: 'nao_realizada',
      }
      await admin.from('dfe_documentos').update({
        status_manifestacao: statusMap[tipo] || 'pendente',
        data_manifestacao: new Date().toISOString(),
      }).eq('id', documentoId)
      await admin.from('dfe_eventos').insert({
        documento_id: documentoId, company_id: companyId,
        tipo, cstat: data.data?.cStat, xmotivo: data.data?.xMotivo,
        nprot: data.data?.nProt, justificativa: justificativa || null, payload: data,
      })
      return j({ success: true, data: data.data })
    }

    // ---------- DOWNLOAD XML ----------
    if (action === 'download_xml') {
      const { documentoId } = body as { documentoId: string }
      const { data: doc } = await admin.from('dfe_documentos')
        .select('id, company_id, fiscalflow_id, chave_acesso')
        .eq('id', documentoId).maybeSingle()
      if (!doc || doc.company_id !== companyId) return j({ error: 'Documento não encontrado' }, 404)

      const r = await fetch(
        `${FF_BASE}/${doc.fiscalflow_id}/xml`,
        { method: 'GET', headers: { 'x-api-key': token } }
      )
      if (!r.ok) {
        const text = await r.text()
        let parsed: unknown = text
        try { parsed = JSON.parse(text) } catch { /* xml or error */ }
        return j({ error: 'XML indisponível', detail: parsed }, r.status)
      }
      const xml = await r.text()
      const path = `${companyId}/${doc.chave_acesso}.xml`
      const { error: upErr } = await admin.storage.from('dfe-xmls').upload(
        path, new Blob([xml], { type: 'application/xml' }),
        { upsert: true, contentType: 'application/xml' }
      )
      if (upErr) return j({ error: 'Falha ao salvar XML: ' + upErr.message }, 500)
      await admin.from('dfe_documentos').update({
        xml_path: path, tipo: 'completo',
      }).eq('id', documentoId)
      return j({ success: true, xml_path: path, xml })
    }

    // ---------- CONSULTAR NA SEFAZ ----------
    if (action === 'consultar') {
      const { documentoId } = body as { documentoId: string }
      const { data: doc } = await admin.from('dfe_documentos')
        .select('id, company_id, fiscalflow_id, chave_acesso')
        .eq('id', documentoId).maybeSingle()
      if (!doc || doc.company_id !== companyId) return j({ error: 'Documento não encontrado' }, 404)
      if (!doc.fiscalflow_id) return j({ error: 'fiscalflow_id ausente (sincronize antes)' }, 400)

      const r = await fetch(`${FF_BASE}/${doc.fiscalflow_id}/consultar`, {
        method: 'POST', headers: ffHeaders, body: JSON.stringify({}),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok || !data?.success) {
        return j({ error: data?.error || 'Falha ao consultar SEFAZ', detail: data }, 502)
      }
      const updates: Record<string, unknown> = {}
      if (data.data?.situacao_nfe) updates.situacao_nfe = data.data.situacao_nfe
      if (data.data?.status_manifestacao) updates.status_manifestacao = data.data.status_manifestacao
      if (Object.keys(updates).length) {
        await admin.from('dfe_documentos').update(updates).eq('id', documentoId)
      }
      return j({ success: true, data: data.data })
    }

    // ---------- MANIFESTAR EM LOTE ----------
    if (action === 'manifestar_lote') {
      const { documentoIds, tipo, justificativa } = body as {
        documentoIds: string[]; tipo: string; justificativa?: string
      }
      if (!Array.isArray(documentoIds) || documentoIds.length === 0 || !tipo) {
        return j({ error: 'documentoIds e tipo obrigatórios' }, 400)
      }
      const { data: docs } = await admin.from('dfe_documentos')
        .select('id, company_id, fiscalflow_id')
        .in('id', documentoIds)
      const valid = (docs || []).filter(d => d.company_id === companyId && d.fiscalflow_id)
      const statusMap: Record<string, string> = {
        ciencia: 'ciente', confirmacao: 'confirmada',
        desconhecimento: 'desconhecida', nao_realizada: 'nao_realizada',
      }
      let ok = 0; const fails: { id: string; error: string }[] = []
      for (const d of valid) {
        try {
          const r = await fetch(`${FF_BASE}/${d.fiscalflow_id}/manifestar`, {
            method: 'POST', headers: ffHeaders,
            body: JSON.stringify({ tipo, justificativa: justificativa || '' }),
          })
          const data = await r.json().catch(() => ({}))
          if (!r.ok || !data?.success) {
            fails.push({ id: d.id, error: data?.error || `HTTP ${r.status}` }); continue
          }
          await admin.from('dfe_documentos').update({
            status_manifestacao: statusMap[tipo] || 'pendente',
            data_manifestacao: new Date().toISOString(),
          }).eq('id', d.id)
          await admin.from('dfe_eventos').insert({
            documento_id: d.id, company_id: companyId,
            tipo, cstat: data.data?.cStat, xmotivo: data.data?.xMotivo,
            nprot: data.data?.nProt, justificativa: justificativa || null, payload: data,
          })
          ok++
        } catch (e) {
          fails.push({ id: d.id, error: (e as Error).message })
        }
      }
      return j({ success: true, ok, fails })
    }

    return j({ error: 'Ação desconhecida' }, 400)
  } catch (err) {
    console.error('[dfe-fiscalflow-proxy] error', err)
    return j({ error: (err as Error).message || 'Erro interno' }, 500)
  }
})

// ---- helpers ----------------------------------------------------------------
async function mirrorList(admin: ReturnType<typeof createClient>, ffHeaders: Record<string,string>, companyId: string): Promise<number> {
  let offset = 0, total = 0
  for (let i = 0; i < 20; i++) {
    const url = `${FF_BASE}/?limit=200&offset=${offset}`
    const r = await fetch(url, { method: 'GET', headers: { 'x-api-key': ffHeaders['x-api-key'] } })
    const data = await r.json().catch(() => ({}))
    if (!r.ok || !data?.success) break
    const arr: any[] = data.data || []
    if (arr.length === 0) break
    const rows = arr.map((d) => ({
      company_id: companyId,
      fiscalflow_id: d.id,
      chave_acesso: d.chave_acesso,
      nsu: d.nsu ?? null,
      tipo: d.tipo || 'resumo',
      cnpj_emitente: d.cnpj_emitente ?? null,
      nome_emitente: d.nome_emitente ?? null,
      numero_nfe: d.numero_nfe ?? null,
      serie: d.serie ?? null,
      data_emissao: d.data_emissao ?? null,
      valor_total: d.valor_total ?? null,
      tp_nf: d.tp_nf ?? null,
      situacao_nfe: d.situacao_nfe ?? null,
      status_manifestacao: d.status_manifestacao || 'pendente',
      data_manifestacao: d.data_manifestacao ?? null,
      raw: d,
    }))
    const { error } = await admin.from('dfe_documentos').upsert(rows, {
      onConflict: 'company_id,chave_acesso', ignoreDuplicates: false,
    })
    if (error) { console.error('[mirror] upsert error', error); break }
    total += rows.length
    if (arr.length < 200) break
    offset += 200
  }
  return total
}