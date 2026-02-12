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
    const expectedSig = 'sha256=' + Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
    return timingSafeEqual(signature, expectedSig)
  } catch {
    return false
  }
}

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

    // Validate signature if secret is configured
    if (webhookSecret) {
      const valid = await validateSignature(rawBody, signature, webhookSecret)
      if (!valid) {
        console.error('[nfce-webhook] Invalid signature')
        return new Response(JSON.stringify({ error: 'Invalid signature' }), {
          status: 401,
          headers: corsHeaders,
        })
      }
    }

    const payload = JSON.parse(rawBody)
    const { evento, dados, timestamp } = payload

    console.log(`[nfce-webhook] Received event: ${evento}`, { nfce_id: dados?.id })

    // Map event to status
    const statusMap: Record<string, string> = {
      'nfce.autorizada': 'autorizada',
      'nfce.rejeitada': 'rejeitada',
      'nfce.cancelada': 'cancelada',
      'nfce.denegada': 'denegada',
    }

    const newStatus = statusMap[evento]
    if (!newStatus || !dados?.id) {
      return new Response(JSON.stringify({ received: true, message: 'Event ignored' }), {
        status: 200,
        headers: corsHeaders,
      })
    }

    // Update record
    const updateData: Record<string, any> = {
      status: newStatus,
      webhook_payload: payload,
      updated_at: new Date().toISOString(),
    }

    if (evento === 'nfce.autorizada') {
      updateData.chave_acesso = dados.chave_acesso
      updateData.protocolo = dados.protocolo
      updateData.qrcode_url = dados.qrcode_url
      updateData.numero = dados.numero
    }

    if (evento === 'nfce.rejeitada' || evento === 'nfce.denegada') {
      updateData.motivo_rejeicao = dados.motivo_retorno || dados.motivo
    }

    const { error } = await supabase
      .from('nfce_records')
      .update(updateData)
      .eq('nfce_id', dados.id)

    if (error) {
      console.error('[nfce-webhook] Update error:', error)
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: corsHeaders,
    })
  } catch (error) {
    console.error('[nfce-webhook] Error:', error)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: corsHeaders,
    })
  }
})
