// Temporário: consulta detalhes de NFC-e rejeitadas direto na Fiscal Flow
// para diagnóstico da rejeição 725 (Cozinha da Ruiva).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body.companyId || '55181771-8b10-4af1-afc3-472c090a49be'
    const ids: string[] = body.ids || ['9f795779-ea06-4885-8d0f-ee734304ab96']
    const probeUpdate: boolean = body.probeUpdate === true
    const NFCE_API_URL = Deno.env.get('NFCE_API_URL')!
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )
    const { data: tok } = await supabase
      .from('store_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'fiscal_flow_api_token')
      .maybeSingle()
    const apiKey = (tok?.value || Deno.env.get('NFCE_API_KEY') || '').trim()

    const out: any[] = []
    for (const id of ids) {
      const r1 = await fetch(`${NFCE_API_URL}/${id}`, { headers: { 'x-api-key': apiKey } })
      const t1 = await r1.text()
      let consultar: any = t1
      try { consultar = JSON.parse(t1) } catch { /* keep text */ }

      const r2 = await fetch(`${NFCE_API_URL}/${id}/xml`, { headers: { 'x-api-key': apiKey } })
      const t2 = await r2.text()

      const entry: any = { id, consultar_status: r1.status, consultar, xml_status: r2.status, xml_len: t2.length, xml_preview: t2.substring(0, 4000) }

      if (probeUpdate) {
        // Sonda quais rotas/métodos a Fiscal Flow aceita para atualizar o
        // payload de uma NFC-e rejeitada. Enviamos um body mínimo válido
        // apenas para checar o status HTTP — nada é alterado se a rota
        // retornar 404/405.
        const configuredBase = NFCE_API_URL.replace(/\/+$/, '')
        const rootBase = configuredBase
          .replace(/\/nfce-api(?:\/emitir)?$/i, '')
          .replace(/\/emitir$/i, '')
          .replace(/\/+$/, '')
        const candidates = [
          `${configuredBase}/${id}`,
          `${configuredBase}/atualizar/${id}`,
          `${configuredBase}/${id}/atualizar`,
          `${configuredBase}/${id}/editar`,
          `${configuredBase}/${id}/corrigir`,
          `${configuredBase}/${id}/payload`,
          `${rootBase}/nfce-api/${id}`,
          `${rootBase}/nfce-api/atualizar/${id}`,
          `${rootBase}/nfce-api/${id}/atualizar`,
          `${rootBase}/nfce-api/${id}/editar`,
          `${rootBase}/nfce-api/${id}/corrigir`,
          `${rootBase}/nfce-api/${id}/payload`,
          `${rootBase}/nfce-api/emitir/${id}`,
        ]
        const methods: Array<'PUT'|'PATCH'|'POST'> = ['PUT','PATCH','POST']
        const probes: any[] = []
        const probeBody = JSON.stringify({ ping: true })
        for (const url of candidates) {
          for (const m of methods) {
            try {
              const r = await fetch(url, {
                method: m,
                headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
                body: probeBody,
              })
              const txt = await r.text()
              probes.push({ method: m, url, status: r.status, body: txt.substring(0, 300) })
            } catch (e: any) {
              probes.push({ method: m, url, error: String(e?.message || e) })
            }
          }
        }
        entry.update_probes = probes
      }

      out.push(entry)
    }
    return new Response(JSON.stringify(out, null, 2), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: String(e?.message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})