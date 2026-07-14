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
    const ids: string[] = body.ids || [
      '76b89fcd-7e4e-4a32-aa22-a48320a72335',
      '3b7b45c2-1df2-4282-989a-e9c3e1db0562',
    ]
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

      out.push({ id, consultar_status: r1.status, consultar, xml_status: r2.status, xml_len: t2.length, xml_preview: t2.substring(0, 4000) })
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