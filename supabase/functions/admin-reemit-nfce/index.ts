// Uso administrativo: reemite uma NFC-e rejeitada com payload corrigido
// (reaproveitando NSU TEF da venda original). Não permite atualização in-place
// porque a Fiscal Flow não suporta editar payload — ela emite nova numeração
// mas a NFC-e rejeitada anterior não consome número na SEFAZ.
//
// Body: { recordId: string, productPatches?: { productId: string, ncm?: string, cest?: string }[] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const body = await req.json()
    const recordId: string = body.recordId
    const productPatches: any[] = body.productPatches || []
    const itemOverridesByCodigo: Record<string, any> = body.itemOverridesByCodigo || {}

    // 1) Atualiza cadastro de produtos (NCM/CEST) se pedido
    for (const p of productPatches) {
      const upd: any = {}
      if (p.ncm !== undefined) upd.ncm = p.ncm
      if (p.cest !== undefined) upd.cest = p.cest
      if (Object.keys(upd).length > 0) {
        await supabase.from('products').update(upd).eq('id', p.productId)
      }
    }

    // 2) Lê o registro original
    const { data: rec, error: recErr } = await supabase
      .from('nfce_records')
      .select('id, company_id, external_id, request_payload, status')
      .eq('id', recordId)
      .single()
    if (recErr || !rec) {
      return new Response(JSON.stringify({ error: 'Registro não encontrado', details: recErr }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // 3) Monta payload corrigido: mesmo tef/observacoes, external_id com sufixo -R{n}
    const orig = rec.request_payload as any
    const nextSuffix = (() => {
      const base = String(rec.external_id || '')
      const m = base.match(/-R(\d+)$/)
      if (m) return { base: base.replace(/-R\d+$/, ''), n: Number(m[1]) + 1 }
      return { base, n: 1 }
    })()
    const newExternalId = `${nextSuffix.base}-R${nextSuffix.n}`

    const itens = (orig.itens || []).map((it: any) => {
      const ov = itemOverridesByCodigo[it.codigo] || {}
      return { ...it, ...ov }
    })

    const payload = {
      ...orig,
      external_id: newExternalId,
      itens,
    }

    // 4) Invoca nfce-proxy com admin bypass
    const proxyUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/nfce-proxy`
    const proxyResp = await fetch(proxyUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-admin-secret': Deno.env.get('NFCE_WEBHOOK_SECRET') || '',
        // Some Supabase edge deployments require an apikey header even with admin bypass
        'apikey': Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '',
      },
      body: JSON.stringify({
        action: 'emitir',
        companyId: rec.company_id,
        payload,
      }),
    })
    const proxyText = await proxyResp.text()
    let proxyJson: any
    try { proxyJson = JSON.parse(proxyText) } catch { proxyJson = { raw: proxyText } }

    // 5) Marca original como substituída se a nova foi autorizada/aceita
    if (proxyResp.ok) {
      await supabase
        .from('nfce_records')
        .update({ status: 'substituida', motivo_rejeicao: `Substituída por ${newExternalId}` })
        .eq('id', recordId)
    }

    return new Response(JSON.stringify({
      ok: proxyResp.ok,
      newExternalId,
      proxyStatus: proxyResp.status,
      proxyResult: proxyJson,
    }, null, 2), {
      status: proxyResp.ok ? 200 : 422,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})