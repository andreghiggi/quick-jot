import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-webhook-signature',
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

// Aceita a assinatura com ou sem o prefixo "sha256=" -- alguns emissores
// (ex.: Fiscal Flow) mandam so o hex puro, sem o prefixo estilo GitHub.
function stripSigPrefix(s: string): string {
  const i = s.indexOf('=')
  return i > 0 && i <= 10 ? s.slice(i + 1) : s
}

async function validateSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature || !secret) return false
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload))
    const expectedHex = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return timingSafeEqual(stripSigPrefix(signature).toLowerCase(), expectedHex)
  } catch {
    return false
  }
}

// Callback de eventos de NF-e (modelo 55) da Fiscal Flow. Equivalente ao
// nfce-webhook, mas para nfe_records -- a Fiscal Flow so assinava eventos
// de NFC-e; sem isso toda NF-e ficava "pendente" pra sempre mesmo quando a
// SEFAZ ja tinha autorizado ou rejeitado de verdade.
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const rawBody = await req.text()
    const signature = req.headers.get('x-webhook-signature') || ''
    const webhookSecret = Deno.env.get('NFCE_WEBHOOK_SECRET')

    if (webhookSecret) {
      const valid = await validateSignature(rawBody, signature, webhookSecret)
      if (!valid) {
        console.error('[nfe-webhook] Invalid signature')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: corsHeaders,
        })
      }
    }

    const payload = JSON.parse(rawBody)
    // Formato real da Fiscal Flow para NF-e: o id do documento vem solto em
    // documento_id, nao dentro de dados (diferente do nfce-webhook). dados{}
    // so traz numero/serie/chave_acesso/status/protocolo/motivo_retorno.
    const { evento, documento_id: documentoId, dados } = payload

    console.log(`[nfe-webhook] Received event: ${evento}`, { documento_id: documentoId })

    const statusMap: Record<string, string> = {
      'nfe.autorizada': 'autorizada',
      'nfe.rejeitada': 'rejeitada',
      'nfe.cancelada': 'cancelada',
      'nfe.denegada': 'denegada',
    }

    const newStatus = statusMap[evento]
    if (!newStatus || !documentoId) {
      return new Response(JSON.stringify({ received: true, message: 'Event ignored' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    const updateData: Record<string, any> = {
      status: newStatus,
      webhook_payload: payload,
      updated_at: new Date().toISOString(),
    }

    if (evento === 'nfe.autorizada') {
      updateData.chave_acesso = dados.chave_acesso
      updateData.protocolo = dados.protocolo
      updateData.numero = dados.numero
      if (dados.danfe_url) updateData.danfe_url = dados.danfe_url
      if (dados.xml_url) updateData.xml_url = dados.xml_url
    }

    if (evento === 'nfe.rejeitada' || evento === 'nfe.denegada') {
      updateData.motivo_rejeicao = dados?.motivo_retorno || dados?.motivo
    }

    // Mesma reconciliacao por external_id que o nfce-webhook ja faz: cobre
    // o caso de uma NF-e orfa cujo insert do nfe-proxy nao gravou o nfe_id.
    const { data: byId, error: err1 } = await supabase
      .from('nfe_records')
      .update(updateData)
      .eq('nfe_id', documentoId)
      .select('id')

    if (err1) console.error('[nfe-webhook] Update error (nfe_id):', err1)

    const externalId = dados?.external_id || payload.external_id
    if ((!byId || byId.length === 0) && externalId) {
      const { data: byExt, error: err2 } = await supabase
        .from('nfe_records')
        .update({ ...updateData, nfe_id: documentoId })
        .eq('external_id', externalId)
        .is('nfe_id', null)
        .select('id')
      if (err2) console.error('[nfe-webhook] Update error (external_id):', err2)
      else console.log('[nfe-webhook] Reconciliado por external_id:', externalId, 'rows=', byExt?.length ?? 0)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('[nfe-webhook] Error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
