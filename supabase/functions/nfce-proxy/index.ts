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
    const GLOBAL_NFCE_API_KEY = Deno.env.get('NFCE_API_KEY')
    const NFCE_API_URL = Deno.env.get('NFCE_API_URL')

    if (!NFCE_API_URL) {
      return new Response(JSON.stringify({ error: 'NFC-e API não configurada (URL ausente)' }), { status: 500, headers: corsHeaders })
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

    // ---- Per-company token (Fiscal Flow) ----------------------------------
    // Lancheria da i9 (and any future store) vincula o emitente na Fiscal Flow
    // exclusivamente pelo token. Buscamos o token salvo em store_settings e,
    // se existir, usamos no x-api-key. Caso contrário, caímos no token global.
    const I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164'
    const isI9 = companyId === I9_COMPANY_ID

    let NFCE_API_KEY: string | null = GLOBAL_NFCE_API_KEY ?? null
    try {
      const { data: tokenRow } = await supabase
        .from('store_settings')
        .select('value')
        .eq('company_id', companyId)
        .eq('key', 'fiscal_flow_api_token')
        .maybeSingle()
      const perCompanyToken = (tokenRow?.value || '').trim()
      if (perCompanyToken) {
        NFCE_API_KEY = perCompanyToken
        console.log('[nfce-proxy] Using per-company Fiscal Flow token for', companyId)
      } else if (isI9) {
        return new Response(
          JSON.stringify({
            error: 'Token Fiscal Flow não configurado para esta loja. Configure em Fiscal → Token da API Fiscal Flow.',
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    } catch (err) {
      console.error('[nfce-proxy] Error loading per-company token:', err)
    }

    if (!NFCE_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'NFC-e API não configurada (token ausente)' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
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

        // Normalização dos itens: garante valor_total por item, valores numéricos
        // arredondados a 2 casas e CST PIS/COFINS coerentes para evitar XML inválido
        // ("vProd vazio" / "PISOutr Missing child element") na Fiscal Flow.
        if (Array.isArray(emitPayload.itens)) {
          const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
          emitPayload.itens = emitPayload.itens.map((it: any) => {
            const qtd = Number(it.quantidade) || 0
            const vUnit = round2(Number(it.valor_unitario) || 0)
            const vTot = round2(qtd * vUnit)
            // Quando CST 49 (Outras) com alíquota zero, o XML obriga vBC/pPIS/vPIS.
            // Trocar para 07 (isento) elimina o grupo PISOutr/COFINSOutr inválido.
            const fixCst = (cst: string, aliq: number) =>
              (cst === '49' || cst === '99') && (!aliq || aliq === 0) ? '07' : cst
            return {
              ...it,
              quantidade: qtd,
              valor_unitario: vUnit,
              valor_total: vTot,
              cst_pis: fixCst(String(it.cst_pis || '49'), Number(it.aliquota_pis) || 0),
              cst_cofins: fixCst(String(it.cst_cofins || '49'), Number(it.aliquota_cofins) || 0),
              aliquota_pis: Number(it.aliquota_pis) || 0,
              aliquota_cofins: Number(it.aliquota_cofins) || 0,
            }
          })
          // Total geral consolidado, descontando desconto e somando frete
          const subtotal = emitPayload.itens.reduce(
            (s: number, it: any) => s + (Number(it.valor_total) || 0),
            0
          )
          const desconto = round2(Number(emitPayload.valor_desconto) || 0)
          const frete = round2(Number(emitPayload.valor_frete) || 0)
          emitPayload.valor_total = round2(subtotal - desconto + frete)
          console.log('[nfce-proxy] Itens normalizados:', JSON.stringify(emitPayload.itens))
          console.log('[nfce-proxy] valor_total calculado:', emitPayload.valor_total)
        }

        // Map optional destinatário (CPF/CNPJ) to the Fiscal API format.
        // Without this block the API emits as "consumidor não identificado".
        if (payload.destinatario && (payload.destinatario.cpf || payload.destinatario.cnpj)) {
          const dest = payload.destinatario
          // A fiscal-api PHP espera as chaves em MINÚSCULAS (cpf, cnpj, nome).
          // Quando recebia em maiúsculas (CPF/CNPJ), ela montava um destinatário
          // vazio + xNome em posição inválida no XML, gerando rejeição SEFAZ.
          // Em homologação, omitimos xNome (a SEFAZ exige nome fictício específico).
          const destOrdered: Record<string, string> = {}
          if (dest.cnpj) destOrdered.cnpj = String(dest.cnpj).replace(/\D/g, '')
          else if (dest.cpf) destOrdered.cpf = String(dest.cpf).replace(/\D/g, '')
          destOrdered.indIEDest = '9' // Não contribuinte
          emitPayload.destinatario = destOrdered
          console.log('[nfce-proxy] Destinatário identificado:', JSON.stringify(emitPayload.destinatario))
        } else {
          // Garante que nada sobre dest vá para a API: evita XML inválido
          delete emitPayload.destinatario
        }

        if (payload.tef) {
          const tef = payload.tef
          const tPagMap: Record<string, string> = {
            'credit': '03',
            'debit': '04',
            'pix': '17',
          }
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
          // CNPJ mapping for known acquirers in Brazil
          const cnpjAdquirenteMap: Record<string, string> = {
            'GETNET': '10440482000154',
            'CIELO': '01027058000191',
            'STONE': '16501555000157',
            'REDE': '01425787000104',
            'PAGSEGURO': '08561701000101',
            'PAGBANK': '08561701000101',
            'SAFRAPAY': '58160789000128',
            'MERCADOPAGO': '10573521000191',
            'SUMUP': '18188384000123',
            'VERO': '01425787000104',
            'BANRISUL': '92702067000196',
            'SICREDI': '01181521000155',
          }
          const bandeiraNorm = (tef.bandeira || '').toUpperCase()
          const adquirenteNorm = (tef.adquirente || '').toUpperCase()
          const cnpjAdquirente = cnpjAdquirenteMap[adquirenteNorm] || tef.cnpj_adquirente || null

          emitPayload.pagamento = {
            tPag: tPagMap[tef.tipo_pagamento] || '99',
            vPag: tef.valor,
            tpIntegra: 1,
            card: {
              tpIntegra: '1',
              CNPJ: cnpjAdquirente,
              tBand: tBandMap[bandeiraNorm] || '99',
              cAut: tef.autorizacao,
              NSU: tef.nsu,
            }
          }

          // Fallback: include NSU in infAdFisco in case the API doesn't accept it in the card group
          const infParts: string[] = []
          if (tef.nsu) infParts.push(`NSU:${tef.nsu}`)
          if (tef.autorizacao) infParts.push(`cAut:${tef.autorizacao}`)
          if (tef.bandeira) infParts.push(`Bandeira:${tef.bandeira}`)
          if (tef.adquirente) infParts.push(`Adquirente:${tef.adquirente}`)
          if (infParts.length > 0) {
            const tefInfo = infParts.join(';')
            emitPayload.infAdFisco = emitPayload.infAdFisco
              ? `${emitPayload.infAdFisco};${tefInfo}`
              : tefInfo
          }

          delete emitPayload.tef
          console.log('[nfce-proxy] TEF payment data added:', JSON.stringify(emitPayload.pagamento))
          console.log('[nfce-proxy] infAdFisco fallback:', emitPayload.infAdFisco)
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
          const motivo = d.motivo_rejeicao || d.motivo_retorno || d.motivo || d.xMotivo || d.reason
          if (motivo) updateData.motivo_rejeicao = motivo

          // Some Fiscal APIs keep status as "pendente" but include a motivo
          // (rejection reason). Treat that as "rejeitada" so the UI can react.
          if (motivo && (!rawStatus || rawStatus === 'pendente' || rawStatus === 'processando')) {
            updateData.status = 'rejeitada'
          }

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
    const message = error instanceof Error ? error.message : 'Erro interno'
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
