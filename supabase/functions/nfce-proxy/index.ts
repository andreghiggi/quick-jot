import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: corsHeaders })
    }

    const userId = user.id
    const NFCE_API_KEY = Deno.env.get('NFCE_API_KEY')
    const NFCE_API_URL = Deno.env.get('NFCE_API_URL')

    if (!NFCE_API_KEY || !NFCE_API_URL) {
      return new Response(JSON.stringify({ error: 'NFC-e API não configurada' }), { status: 500, headers: corsHeaders })
    }

    const body = await req.json()
    const { action, companyId, saleId, nfceId, payload } = body

    // Verify user belongs to company
    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: userId,
      _company_id: companyId
    })
    if (!belongs) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), { status: 403, headers: corsHeaders })
    }

    let apiResponse: Response
    let result: any

    async function safeJson(resp: Response): Promise<any> {
      const text = await resp.text()
      try {
        return JSON.parse(text)
      } catch {
        console.error('[nfce-proxy] API returned non-JSON:', text.substring(0, 200))
        return { success: false, error: `API retornou resposta inválida (status ${resp.status}). Verifique a URL configurada em NFCE_API_URL.`, raw: text.substring(0, 500) }
      }
    }

    // Extract numero and serie from chave de acesso if not provided directly
    // Chave format: UF(2) AAMM(4) CNPJ(14) MOD(2) SERIE(3) NNF(9) ...
    function extractFromChave(chave: string): { numero: string | null, serie: string | null } {
      if (!chave || chave.length < 34) return { numero: null, serie: null }
      const serie = String(parseInt(chave.substring(22, 25), 10))
      const numero = String(parseInt(chave.substring(25, 34), 10))
      return { numero, serie }
    }

    // Build SEFAZ QR Code URL from chave when API doesn't return it
    function buildQrcodeUrl(chave: string, ambiente: string): string | null {
      if (!chave || chave.length < 44) return null
      // UF code is the first 2 digits of the chave
      const uf = chave.substring(0, 2)
      // Map UF codes to SEFAZ NFC-e URLs
      const sefazUrls: Record<string, string> = {
        '43': 'https://www.sefaz.rs.gov.br/NFCE/NFCE-COM.aspx',
        '35': 'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica',
        '31': 'https://nfce.fazenda.mg.gov.br/portalnfce',
        '41': 'http://www.nfce.pr.gov.br/nfce/qrcode',
        '42': 'https://sat.sef.sc.gov.br/nfce/consulta',
        '33': 'https://www.nfce.fazenda.rj.gov.br/consulta',
        '29': 'https://nfe.sefaz.ba.gov.br/servicos/nfce/modulos/geral/NFCEC_consulta_chave_acesso.aspx',
      }
      const baseUrl = sefazUrls[uf]
      if (!baseUrl) return null
      const ambienteCode = ambiente === 'producao' ? '1' : '2'
      return `${baseUrl}?p=${chave}|${ambienteCode}|2`
    }

    switch (action) {

      case 'emitir': {
        console.log('[nfce-proxy] Emitir NFC-e, URL:', NFCE_API_URL)

        // If TEF data is present, add payment group to payload
        const emitPayload = { ...payload }
        if (payload.tef) {
          const tef = payload.tef
          // Map payment type to NFC-e tPag codes
          const tPagMap: Record<string, string> = {
            'credit': '03',  // Cartão de Crédito
            'debit': '04',   // Cartão de Débito
            'pix': '17',     // PIX
          }
          // Map card brand to tBand codes
          const tBandMap: Record<string, string> = {
            'VISA': '01',
            'MASTERCARD': '02',
            'AMEX': '03',
            'AMERICAN EXPRESS': '03',
            'SOROCRED': '04',
            'DINERS': '05',
            'ELO': '06',
            'HIPERCARD': '07',
            'AURA': '08',
            'CABAL': '09',
          }
          const bandeiraNorm = (tef.bandeira || '').toUpperCase()
          emitPayload.pagamento = {
            tPag: tPagMap[tef.tipo_pagamento] || '99',
            vPag: tef.valor,
            tpIntegra: 1, // TEF integrado
            card: {
              tpIntegra: '1',
              CNPJ: tef.cnpj_adquirente || null,
              tBand: tBandMap[bandeiraNorm] || '99',
              cAut: tef.autorizacao,
              NSU: tef.nsu,
            }
          }
          // Remove tef from payload sent to API (already mapped to pagamento)
          delete emitPayload.tef
          console.log('[nfce-proxy] TEF payment data added:', JSON.stringify(emitPayload.pagamento))
        }

        apiResponse = await fetch(NFCE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NFCE_API_KEY,
          },
          body: JSON.stringify(emitPayload),
        })
        result = await safeJson(apiResponse)

        console.log('[nfce-proxy] Emitir raw result:', JSON.stringify(result).substring(0, 1000))

        // Handle both { data: {...} } and flat response
        const emitData = result?.data || result
        if (emitData && (emitData.id || emitData.nfce_id)) {
          const chave = emitData.chave_acesso || emitData.chave || emitData.access_key || null
          const fromChave = chave ? extractFromChave(chave) : { numero: null, serie: null }
          const nfceRecord = {
            company_id: companyId,
            sale_id: saleId || null,
            external_id: payload.external_id,
            nfce_id: emitData.id || emitData.nfce_id,
            numero: emitData.numero || emitData.number || fromChave.numero || null,
            serie: emitData.serie || emitData.series || fromChave.serie || null,
            status: emitData.status || 'pendente',
            ambiente: emitData.ambiente || emitData.environment || 'homologacao',
            valor_total: emitData.valor_total || emitData.total || (payload?.itens ? payload.itens.reduce((sum: number, item: any) => sum + (Number(item.quantidade || 1) * Number(item.valor_unitario || 0)), 0) : 0),
            chave_acesso: chave,
            protocolo: emitData.protocolo || emitData.protocol || null,
            qrcode_url: emitData.qrcode_url || emitData.qr_code_url || emitData.url_qrcode || emitData.qrcode || (chave ? buildQrcodeUrl(chave, emitData.ambiente || emitData.environment || 'homologacao') : null),
            xml_url: emitData.xml_url || emitData.url_xml || null,
            motivo_rejeicao: emitData.motivo_rejeicao || emitData.motivo || null,
            request_payload: payload,
            response_payload: result,
          }
          console.log('[nfce-proxy] Inserting record:', JSON.stringify(nfceRecord))
          const { error: insertError } = await supabase.from('nfce_records').insert(nfceRecord)
          if (insertError) console.error('[nfce-proxy] Insert error:', insertError)
        } else {
          console.error('[nfce-proxy] Emitir: unexpected response structure, no id found:', JSON.stringify(result).substring(0, 500))
        }
        break
      }

      case 'consultar': {
        console.log('[nfce-proxy] Consultar NFC-e:', nfceId)
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await safeJson(apiResponse)

        console.log('[nfce-proxy] Consultar raw result:', JSON.stringify(result).substring(0, 1000))

        // Update local record - handle both { data: {...} } and flat response structures
        const d = result?.data || result
        if (d && (d.status || d.id || d.nfce_id)) {
          const updateData: Record<string, any> = {
            updated_at: new Date().toISOString(),
            webhook_payload: result,
          }

          // Status - normalize common variations
          const rawStatus = d.status || d.situacao || d.situation
          if (rawStatus) updateData.status = rawStatus

          // Numero/serie
          if (d.numero || d.number) updateData.numero = d.numero || d.number
          if (d.serie || d.series) updateData.serie = d.serie || d.series

          const chaveConsulta = d.chave_acesso || d.chave || d.access_key || d.chnfe
          const fromChaveConsulta = chaveConsulta ? extractFromChave(chaveConsulta) : { numero: null, serie: null }
          if (chaveConsulta) updateData.chave_acesso = chaveConsulta

          // Numero/serie - try direct fields first, then extract from chave
          if (d.numero || d.number) updateData.numero = d.numero || d.number
          else if (fromChaveConsulta.numero) updateData.numero = fromChaveConsulta.numero
          if (d.serie || d.series) updateData.serie = d.serie || d.series
          else if (fromChaveConsulta.serie) updateData.serie = fromChaveConsulta.serie

          // Protocolo
          const proto = d.protocolo || d.protocol || d.nProt
          if (proto) updateData.protocolo = proto

          // QR Code URL - try multiple field names, fallback to building from chave
          const qr = d.qrcode_url || d.qr_code_url || d.url_qrcode || d.qrcode || d.qr_code || d.url_consulta_qrcode
          const chaveForQr = updateData.chave_acesso || chaveConsulta
          if (qr) {
            updateData.qrcode_url = qr
          } else if (chaveForQr) {
            const builtQr = buildQrcodeUrl(chaveForQr, updateData.ambiente || d.ambiente || 'homologacao')
            if (builtQr) updateData.qrcode_url = builtQr
          }

          // XML URL
          const xml = d.xml_url || d.url_xml || d.xml
          if (xml) updateData.xml_url = xml

          // Motivo rejeição
          const motivo = d.motivo_rejeicao || d.motivo || d.xMotivo || d.reason
          if (motivo) updateData.motivo_rejeicao = motivo

          // Ambiente
          if (d.ambiente || d.environment) updateData.ambiente = d.ambiente || d.environment

          // Valor total
          if (d.valor_total || d.total || d.vNF) updateData.valor_total = d.valor_total || d.total || d.vNF

          console.log('[nfce-proxy] Updating record with:', JSON.stringify(updateData))
          const { error: updateError } = await supabase.from('nfce_records')
            .update(updateData)
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)

          if (updateError) {
            console.error('[nfce-proxy] Update error:', updateError)
          } else {
            console.log('[nfce-proxy] Record updated successfully')
          }
        } else {
          console.log('[nfce-proxy] No data to update, result structure:', JSON.stringify(result).substring(0, 500))
        }
        break
      }

      case 'cancelar': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/cancelar`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': NFCE_API_KEY,
          },
          body: JSON.stringify({ justificativa: payload?.justificativa }),
        })
        result = await safeJson(apiResponse)

        if (result.success) {
          await supabase.from('nfce_records')
            .update({ status: 'cancelada', updated_at: new Date().toISOString() })
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)
        }
        break
      }

      case 'reprocessar': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/reprocessar`, {
          method: 'POST',
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await safeJson(apiResponse)
        break
      }

      case 'xml': {
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/xml`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await safeJson(apiResponse)
        break
      }

      case 'danfe': {
        console.log('[nfce-proxy] Fetching DANFE for:', nfceId)
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/danfe`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        
        const contentType = apiResponse.headers.get('content-type') || ''
        const danfeStatus = apiResponse.status
        console.log('[nfce-proxy] DANFE response status:', danfeStatus, 'content-type:', contentType)
        
        if (!apiResponse.ok) {
          const errText = await apiResponse.text()
          console.error('[nfce-proxy] DANFE error response:', errText.substring(0, 500))
          result = { success: false, error: `DANFE endpoint retornou ${danfeStatus}`, raw: errText.substring(0, 300) }
        } else if (contentType.includes('application/pdf')) {
          // Return PDF as base64
          const arrayBuf = await apiResponse.arrayBuffer()
          const uint8 = new Uint8Array(arrayBuf)
          let binary = ''
          for (let i = 0; i < uint8.length; i++) {
            binary += String.fromCharCode(uint8[i])
          }
          const base64 = btoa(binary)
          result = { success: true, content_type: 'application/pdf', data: base64 }
        } else if (contentType.includes('application/json')) {
          result = await safeJson(apiResponse)
          console.log('[nfce-proxy] DANFE JSON result:', JSON.stringify(result).substring(0, 500))
        } else {
          // HTML or other text format
          const textContent = await apiResponse.text()
          console.log('[nfce-proxy] DANFE text content type:', contentType, 'length:', textContent.length)
          result = { success: true, content_type: contentType || 'text/html', html: textContent }
        }
        break
      }

      case 'listar': {
        const params = new URLSearchParams(payload || {})
        apiResponse = await fetch(`${NFCE_API_URL}?${params}`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        result = await safeJson(apiResponse)
        break
      }

      default:
        return new Response(JSON.stringify({ error: 'Ação inválida' }), { status: 400, headers: corsHeaders })
    }

    return new Response(JSON.stringify(result), {
      status: apiResponse!.ok ? 200 : apiResponse!.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('[nfce-proxy] Error:', error)
    return new Response(JSON.stringify({ error: error.message || 'Erro interno' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
