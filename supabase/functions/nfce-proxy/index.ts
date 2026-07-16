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

    // ---- Contingência Offline SEGURA (protocolo Fiscal Flow v2) ------------
    // Fluxo:
    //  1) Tenta emitir online com timeout curto (20s).
    //  2) Se estourar, chama POST /nfce-api/abortar-online?external_id=... na
    //     FF para impedir que a SEFAZ autorize a original atrasada.
    //     - 200: abortou. Reemitimos com tp_emis=9 (contingência) usando o
    //       MESMO external_id, mantendo idempotência.
    //     - 409: SEFAZ já autorizou a original — usamos ela, sem duplicar.
    //     - outro: mantém como "processando" para consulta posterior.
    //  3) Idempotência por (company_id, external_id) impede duplicidade.
    const EMIT_TIMEOUT_MS = 20000
    const FF_BASE_URL = NFCE_API_URL.replace(/\/emitir\/?$/i, '').replace(/\/+$/, '')

    async function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), ms)
      try {
        return await fetch(url, { ...init, signal: ctrl.signal })
      } finally {
        clearTimeout(t)
      }
    }

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

    // Extract tpAmb from XML returned by Fiscal Flow. The provider may return
    // the XML as raw text (starts with "<?xml") OR as base64 — we must handle
    // both, otherwise authorized production NFC-es are mis-tagged as
    // homologation and the SEFAZ environment column shows the wrong value.
    function ambienteFromXml(xmlRaw: any): string | null {
      if (!xmlRaw || typeof xmlRaw !== 'string') return null
      const tryMatch = (s: string): string | null => {
        const m = s.match(/<tpAmb>\s*(\d)\s*<\/tpAmb>/)
        if (!m) return null
        return m[1] === '1' ? 'producao' : 'homologacao'
      }
      // 1) Raw XML (most common with Fiscal Flow)
      if (xmlRaw.includes('<tpAmb>')) {
        const r = tryMatch(xmlRaw)
        if (r) return r
      }
      // 2) Base64-encoded XML (legacy / other providers)
      try {
        const decoded = atob(xmlRaw)
        const r = tryMatch(decoded)
        if (r) return r
      } catch {
        /* not base64 */
      }
      return null
    }

    // Try multiple known field names for the returned XML payload.
    function pickXmlField(d: any): any {
      if (!d) return null
      return d.xml_retorno || d.xml || d.xml_autorizado || d.xmlNFe || d.xml_proc || null
    }

    switch (action) {

      case 'emitir': {
        console.log('[nfce-proxy] Emitir NFC-e, URL:', NFCE_API_URL)

        // If TEF data is present, add payment group to payload
        const emitPayload = { ...payload }

        // Mapeia "observacoes" (vindo do front) para os campos que a Fiscal Flow
        // aceita como informações complementares (infCpl no XML). Mantemos
        // ambos os nomes para compatibilidade com versões antigas da API.
        if (payload.observacoes && typeof payload.observacoes === 'string') {
          const obs = payload.observacoes.trim()
          if (obs) {
            emitPayload.infCpl = emitPayload.infCpl ? `${emitPayload.infCpl} | ${obs}` : obs
            emitPayload.informacoes_complementares = emitPayload.informacoes_complementares
              ? `${emitPayload.informacoes_complementares} | ${obs}`
              : obs
            emitPayload.informacoesAdicionais = emitPayload.informacoesAdicionais
              ? `${emitPayload.informacoesAdicionais} | ${obs}`
              : obs
            console.log('[nfce-proxy] Observacao mapeada para infCpl:', obs)
          }
        }

        // Normalização dos itens: garante valor_total por item, valores numéricos
        // arredondados a 2 casas e CST PIS/COFINS coerentes para evitar XML inválido
        // ("vProd vazio" / "PISOutr Missing child element") na Fiscal Flow.
        if (Array.isArray(emitPayload.itens)) {
          const round2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100
          const money = (n: number) => round2(n).toFixed(2)
          const qty = (n: number) => (Number(n) || 0).toFixed(4)
          emitPayload.itens = emitPayload.itens.map((it: any) => {
            const qtd = Number(it.quantidade) || 0
            const vUnit = round2(Number(it.valor_unitario) || 0)
            const vTot = round2(qtd * vUnit)
            // Quando CST 49 (Outras) com alíquota zero, o XML obriga vBC/pPIS/vPIS.
            // Trocar para 07 (isento) elimina o grupo PISOutr/COFINSOutr inválido.
            const fixCst = (cst: string, aliq: number) =>
              (cst === '49' || cst === '99') && (!aliq || aliq === 0) ? '07' : cst
            // CEST é opcional: só repassa quando vier preenchido (string com 7 dígitos).
            // Alguns produtos não exigem CEST e enviar vazio quebra o XML.
            const cestRaw = (it.cest ?? it.CEST ?? '').toString().replace(/\D/g, '')
            const cestField = cestRaw.length === 7 ? { cest: cestRaw, CEST: cestRaw } : {}
            return {
              ...it,
              ...cestField,
              quantidade: qtd,
              qCom: qty(qtd),
              qTrib: qty(qtd),
              valor_unitario: vUnit,
              valorUnitario: money(vUnit),
              valor: money(vUnit),
              vUnCom: money(vUnit),
              vUnTrib: money(vUnit),
              valor_total: vTot,
              valorTotal: money(vTot),
              total: money(vTot),
              vProd: money(vTot),
              cst_pis: fixCst(String(it.cst_pis || '49'), Number(it.aliquota_pis) || 0),
              CSTPIS: fixCst(String(it.cst_pis || '49'), Number(it.aliquota_pis) || 0),
              cst_cofins: fixCst(String(it.cst_cofins || '49'), Number(it.aliquota_cofins) || 0),
              CSTCOFINS: fixCst(String(it.cst_cofins || '49'), Number(it.aliquota_cofins) || 0),
              aliquota_pis: Number(it.aliquota_pis) || 0,
              pPIS: money(Number(it.aliquota_pis) || 0),
              aliquota_cofins: Number(it.aliquota_cofins) || 0,
              pCOFINS: money(Number(it.aliquota_cofins) || 0),
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
            'MAESTRO': '02',
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

          const pagamentoObj = {
            tPag: tPagMap[tef.tipo_pagamento] || '99',
            vPag: Number(tef.valor || 0).toFixed(2),
            tpIntegra: 1,
            card: {
              tpIntegra: '1',
              CNPJ: cnpjAdquirente,
              tBand: tBandMap[bandeiraNorm] || '99',
              cAut: tef.autorizacao,
              NSU: tef.nsu,
            }
          }
          const formaPagamentoObj = {
            forma_pagamento: pagamentoObj.tPag,
            valor_pagamento: Number(tef.valor || 0),
            tipo_integracao: 1,
            cnpj_credenciadora: cnpjAdquirente,
            bandeira_operadora: tBandMap[bandeiraNorm] || '99',
            numero_autorizacao: tef.autorizacao,
          }
          const detPagObj = {
            indPag: '0',
            tPag: pagamentoObj.tPag,
            vPag: Number(tef.valor || 0).toFixed(2),
            tpIntegra: '1',
            card: {
              tpIntegra: '1',
              CNPJ: cnpjAdquirente,
              tBand: tBandMap[bandeiraNorm] || '99',
              cAut: tef.autorizacao,
              NSU: tef.nsu,
            },
            CNPJ: cnpjAdquirente,
            tBand: tBandMap[bandeiraNorm] || '99',
            cAut: tef.autorizacao,
            NSU: tef.nsu,
          }
          // Mantém `pagamento` (singular) para todas as lojas — comportamento legado.
          emitPayload.pagamento = pagamentoObj
          // Lancheria da i9 (homologação): a Fiscal Flow ignorou `pagamentos` sozinho e ainda
          // gerou <tPag>01</tPag>. Enviamos também o grupo fiscal literal `pag.detPag`, que é o
          // nome do bloco NFe 4.00 no XML. Isolado por loja até validar.
          if (isI9) {
            emitPayload.pagamento = { ...pagamentoObj, ...formaPagamentoObj }
            emitPayload.formas_pagamento = [formaPagamentoObj]
            emitPayload.pagamentos = [pagamentoObj]
            emitPayload.pag = { detPag: [detPagObj] }
            emitPayload.detPag = [detPagObj]
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
          if (isI9) {
            console.log('[nfce-proxy][I9] formas_pagamento:', JSON.stringify(emitPayload.formas_pagamento))
            console.log('[nfce-proxy][I9] pagamentos array:', JSON.stringify(emitPayload.pagamentos))
            console.log('[nfce-proxy][I9] pag.detPag:', JSON.stringify(emitPayload.pag))
          }
          console.log('[nfce-proxy] infAdFisco fallback:', emitPayload.infAdFisco)
        }

        // -----------------------------------------------------------------
        // MULTI-PAYMENT (pagamentos_split): NFC-e v1.6 — múltiplos detPag.
        // Bloco isolado: só executa quando o front envia `pagamentos_split`.
        // Quando presente, sobrescreve o que o bloco TEF acima eventualmente
        // tenha montado e gera 1 detPag por linha (cash + N TEFs).
        // Não altera o fluxo single-payment (continua igual quando ausente).
        // -----------------------------------------------------------------
        if (Array.isArray(payload.pagamentos_split) && payload.pagamentos_split.length > 0) {
          const tPagMap: Record<string, string> = {
            'credit': '03',
            'debit': '04',
            'pix': '17',
          }
          const tBandMap: Record<string, string> = {
            'VISA': '01', 'MASTERCARD': '02', 'AMEX': '03', 'AMERICAN EXPRESS': '03',
            'MAESTRO': '02', 'SOROCRED': '04', 'DINERS': '05', 'ELO': '06',
            'HIPERCARD': '07', 'AURA': '08', 'CABAL': '09',
          }
          const cnpjAdquirenteMap: Record<string, string> = {
            'GETNET': '10440482000154', 'CIELO': '01027058000191', 'STONE': '16501555000157',
            'REDE': '01425787000104', 'PAGSEGURO': '08561701000101', 'PAGBANK': '08561701000101',
            'SAFRAPAY': '58160789000128', 'MERCADOPAGO': '10573521000191', 'SUMUP': '18188384000123',
            'VERO': '01425787000104', 'BANRISUL': '92702067000196', 'SICREDI': '01181521000155',
          }

          const pagamentosArr: any[] = []
          const detPagArr: any[] = []
          const formasArr: any[] = []

          for (const linha of payload.pagamentos_split) {
            const valor = Number(linha.valor || 0)
            const vPagStr = valor.toFixed(2)

            if (linha.tipo === 'tef' && linha.tef) {
              const t = linha.tef
              const tPag = tPagMap[t.tipo_pagamento] || '99'
              const bandeiraNorm = (t.bandeira || '').toUpperCase()
              const adquirenteNorm = (t.adquirente || '').toUpperCase()
              const cnpj = cnpjAdquirenteMap[adquirenteNorm] || null
              const tBand = tBandMap[bandeiraNorm] || '99'
              pagamentosArr.push({
                tPag,
                vPag: vPagStr,
                tpIntegra: 1,
                card: { tpIntegra: '1', CNPJ: cnpj, tBand, cAut: t.autorizacao, NSU: t.nsu },
              })
              detPagArr.push({
                indPag: '0', tPag, vPag: vPagStr, tpIntegra: '1',
                card: { tpIntegra: '1', CNPJ: cnpj, tBand, cAut: t.autorizacao, NSU: t.nsu },
                CNPJ: cnpj, tBand, cAut: t.autorizacao, NSU: t.nsu,
              })
              formasArr.push({
                forma_pagamento: tPag,
                valor_pagamento: valor,
                tipo_integracao: 1,
                cnpj_credenciadora: cnpj,
                bandeira_operadora: tBand,
                numero_autorizacao: t.autorizacao,
              })
            } else if (linha.tipo === 'crediario') {
              // Venda no crediário — NFC-e da mercadoria com tPag=05
              // (Crédito Loja). Não há dados de cartão.
              pagamentosArr.push({ tPag: '05', vPag: vPagStr })
              detPagArr.push({ indPag: '1', tPag: '05', vPag: vPagStr })
              formasArr.push({ forma_pagamento: '05', valor_pagamento: valor })
            } else if (linha.tipo === 'pix') {
              // PIX manual (fora do TEF) — tPag=17.
              pagamentosArr.push({ tPag: '17', vPag: vPagStr })
              detPagArr.push({ indPag: '0', tPag: '17', vPag: vPagStr })
              formasArr.push({ forma_pagamento: '17', valor_pagamento: valor })
            } else {
              // cash / dinheiro
              pagamentosArr.push({ tPag: '01', vPag: vPagStr })
              detPagArr.push({ indPag: '0', tPag: '01', vPag: vPagStr })
              formasArr.push({ forma_pagamento: '01', valor_pagamento: valor })
            }
          }

          // Sobrescreve o que o bloco TEF legado eventualmente tenha montado.
          // IMPORTANTE: a Fiscal Flow, quando recebe `pagamento` (singular),
          // USA SÓ ELE e ignora todos os arrays — colapsando o split em
          // um único <detPag>. Testes empíricos (homologação I9, jun/2026)
          // confirmaram que enviar APENAS os arrays gera múltiplos <detPag>
          // corretamente. Por isso, no split, removemos o singular.
          delete emitPayload.pagamento
          emitPayload.pagamentos = pagamentosArr
          emitPayload.formas_pagamento = formasArr
          emitPayload.pag = { detPag: detPagArr }
          emitPayload.detPag = detPagArr

          console.log('[nfce-proxy] MULTI pagamentos_split (n=' + pagamentosArr.length + '):',
            JSON.stringify(pagamentosArr))
        }

        // -------------------------------------------------------------------
        // IDEMPOTÊNCIA: antes de emitir, verifica se já existe uma NFC-e para
        // este (company_id, external_id). Se existir e estiver autorizada,
        // processando ou pendente, devolve o registro existente em vez de
        // gerar uma nova numeração. Isso protege contra:
        //  - cliques duplicados / retries do frontend após timeout
        //  - reemissão automática indevida
        //  - reprocesso via job/scheduler
        // -------------------------------------------------------------------
        if (payload.external_id) {
          const { data: existing } = await supabase
            .from('nfce_records')
            .select('*')
            .eq('company_id', companyId)
            .eq('external_id', payload.external_id)
            .in('status', ['autorizada', 'processando', 'pendente', 'rejeitada'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()
          if (existing && existing.status !== 'rejeitada') {
            console.warn('[nfce-proxy][idempotency] external_id já emitido:',
              payload.external_id, '→ devolvendo registro existente numero=', existing.numero)
            return new Response(JSON.stringify({
              success: true,
              deduped: true,
              data: {
                id: existing.nfce_id,
                numero: existing.numero,
                serie: existing.serie,
                chave_acesso: existing.chave_acesso,
                status: existing.status,
                protocolo: existing.protocolo,
                qrcode_url: existing.qrcode_url,
                xml_url: existing.xml_url,
                ambiente: existing.ambiente,
              },
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
        }

        // Emissão online com timeout curto (20s). Em caso de timeout aciona o
        // protocolo de contingência SEGURA da Fiscal Flow: abortar-online +
        // reemissão em contingência (tp_emis=9), sempre com o MESMO external_id
        // para preservar idempotência e não gerar nota duplicada.
        let networkTimedOut = false
        let contingencyOk = false
        try {
          apiResponse = await fetchWithTimeout(NFCE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': NFCE_API_KEY },
            body: JSON.stringify(emitPayload),
          }, EMIT_TIMEOUT_MS)
          result = await safeJson(apiResponse)
        } catch (err: any) {
          networkTimedOut = err?.name === 'AbortError'
          console.error('[nfce-proxy] Emitir online: timeout/erro. timedOut=', networkTimedOut, err)

          if (networkTimedOut && payload.external_id) {
            // 1) abortar-online: impede que a SEFAZ autorize a original atrasada.
            let abortStatus = 0
            try {
              const abortResp = await fetchWithTimeout(
                `${FF_BASE_URL}/nfce-api/abortar-online`,
                {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-api-key': NFCE_API_KEY },
                  body: JSON.stringify({ external_id: payload.external_id }),
                },
                10000,
              )
              abortStatus = abortResp.status
              console.log('[nfce-proxy][contingencia] abortar-online status=', abortStatus)
            } catch (e) {
              console.error('[nfce-proxy][contingencia] abortar-online falhou:', e)
            }

            if (abortStatus === 200) {
              // 2a) Reemite em contingência (tp_emis=9), mesmo external_id.
              const contingPayload = {
                ...emitPayload,
                tp_emis: 9,
                tpEmis: 9,
                contingencia_offline: true,
                justificativa_contingencia:
                  emitPayload.justificativa_contingencia ||
                  'Timeout online SEFAZ/Fiscal Flow — emissão em contingência offline',
              }
              try {
                apiResponse = await fetchWithTimeout(NFCE_API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'x-api-key': NFCE_API_KEY },
                  body: JSON.stringify(contingPayload),
                }, EMIT_TIMEOUT_MS)
                result = await safeJson(apiResponse)
                contingencyOk = true
                console.log('[nfce-proxy][contingencia] reemissão tp_emis=9 concluída')
              } catch (e2) {
                console.error('[nfce-proxy][contingencia] reemissão falhou:', e2)
              }
            } else if (abortStatus === 409) {
              // 2b) Original já autorizada — consulta e usa ela.
              console.log('[nfce-proxy][contingencia] original já autorizada (409). Consultando…')
              try {
                const cons = await fetchWithTimeout(
                  `${FF_BASE_URL}/nfce-api/consultar?external_id=${encodeURIComponent(payload.external_id)}`,
                  { method: 'GET', headers: { 'x-api-key': NFCE_API_KEY } },
                  10000,
                )
                result = await safeJson(cons)
                apiResponse = cons
                contingencyOk = true
              } catch (e3) {
                console.error('[nfce-proxy][contingencia] consultar falhou:', e3)
              }
            }
          }

          if (!contingencyOk && payload.external_id) {
            try {
              await supabase.from('nfce_records').insert({
                company_id: companyId,
                sale_id: saleId || null,
                external_id: payload.external_id,
                nfce_id: null,
                status: 'processando',
                ambiente: emitPayload?.ambiente || payload?.ambiente || 'homologacao',
                valor_total: emitPayload?.itens
                  ? emitPayload.itens.reduce((sum: number, item: any) =>
                      sum + Number(item.quantidade || 1) * Number(item.valor_unitario || 0), 0)
                  : 0,
                motivo_rejeicao: networkTimedOut
                  ? 'Contingência não concluída (timeout + abortar-online falhou). NÃO reemitir — consultar por external_id.'
                  : `Erro de rede: ${String(err?.message || err).substring(0, 500)}`,
                request_payload: isI9 ? emitPayload : payload,
                response_payload: null,
                contingencia_offline: false,
                contingencia_efetivada: false,
              })
            } catch (e) {
              console.error('[nfce-proxy] Falha ao gravar processando:', e)
            }
            return new Response(JSON.stringify({
              success: false,
              processando: true,
              error: 'NFC-e sem retorno definitivo da SEFAZ. NÃO reemita — consulte pelo external_id.',
              external_id: payload.external_id,
            }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
          }
        }

        console.log('[nfce-proxy] Emitir raw result:', JSON.stringify(result).substring(0, 1000))

        // Handle both { data: {...} } and flat response
        const emitData = result?.data || result
        if (emitData && (emitData.id || emitData.nfce_id)) {
          const chave = emitData.chave_acesso || emitData.chave || emitData.access_key || null
          const fromChave = chave ? extractFromChave(chave) : { numero: null, serie: null }
          // Fallback chain: API response → XML tpAmb → request payload (what we
          // actually sent to SEFAZ) → 'homologacao'. Using emitPayload.ambiente
          // prevents authorized production NFC-es from being mis-tagged as
          // homologação when the API response omits the ambiente field.
          const ambienteResolved =
            emitData.ambiente ||
            emitData.environment ||
            ambienteFromXml(pickXmlField(emitData)) ||
            emitPayload?.ambiente ||
            emitPayload?.environment ||
            payload?.ambiente ||
            'homologacao'
          // Detecta tpEmis real no XML autorizado: se a Focus emitiu em modo
          // normal (tpEmis=1) mesmo depois de termos pedido contingência, NÃO
          // marcamos como contingência — isso acontece quando o timeout de 8s
          // estourou mas a SEFAZ na verdade só estava lenta, não indisponível.
          const xmlStr = pickXmlField(emitData) || ''
          const xmlTpEmisMatch = xmlStr.match(/<tpEmis>\s*(\d)\s*<\/tpEmis>/i)
          const xmlTpEmis = xmlTpEmisMatch ? Number(xmlTpEmisMatch[1]) : null
          const emittedInContingencia =
            xmlTpEmis === 9 ||
            emitData.tpEmis === 9 ||
            String(emitData.forma_emissao || '') === '9' ||
            emitData.contingencia_offline === true

          const nfceRecord = {
            company_id: companyId,
            sale_id: saleId || null,
            external_id: payload.external_id,
            nfce_id: emitData.id || emitData.nfce_id,
            numero: emitData.numero || emitData.number || fromChave.numero || null,
            serie: emitData.serie || emitData.series || fromChave.serie || null,
            status: emitData.status || 'pendente',
            ambiente: ambienteResolved,
            valor_total: emitData.valor_total || emitData.total || (emitPayload?.itens ? emitPayload.itens.reduce((sum: number, item: any) => sum + (Number(item.quantidade || 1) * Number(item.valor_unitario || 0)), 0) : 0),
            chave_acesso: chave,
            protocolo: emitData.protocolo || emitData.protocol || null,
            qrcode_url: emitData.qrcode_url || emitData.qr_code_url || emitData.url_qrcode || emitData.qrcode || (chave ? buildQrcodeUrl(chave, ambienteResolved) : null),
            xml_url: emitData.xml_url || emitData.url_xml || null,
            motivo_rejeicao: emitData.motivo_rejeicao || emitData.motivo || null,
            request_payload: isI9 ? emitPayload : payload,
            response_payload: result,
            contingencia_offline: emittedInContingencia,
            contingencia_efetivada: emittedInContingencia && (
              emitData.contingencia_offline_efetivada === true ||
              emitData.contingencia_efetivada === true
            ),
          }
          console.log('[nfce-proxy] Inserting record:', JSON.stringify(nfceRecord))
          const { error: insertError } = await supabase.from('nfce_records').insert(nfceRecord)
          if (insertError) console.error('[nfce-proxy] Insert error:', insertError)
        } else {
          // Rejeição da Focus/SEFAZ (ex.: NCM inválido, total divergente, CFOP
          // incompatível). Antes, jogávamos o motivo fora e a UI só via um
          // toast genérico "non-2xx". Agora persistimos a NFC-e como
          // `rejeitada` com o motivo real, para o operador ver no card e o
          // suporte investigar direto no banco.
          console.error('[nfce-proxy] Emitir: rejeitado pelo gateway/SEFAZ:',
            JSON.stringify(result).substring(0, 800))

          const rej = result?.data || result || {}
          const motivo =
            rej.motivo_rejeicao ||
            rej.motivo ||
            rej.mensagem_sefaz ||
            rej.mensagem ||
            rej.message ||
            rej.erro ||
            rej.error ||
            (Array.isArray(rej.erros) ? rej.erros.map((e: any) => e?.mensagem || e?.message || JSON.stringify(e)).join(' | ') : null) ||
            (apiResponse ? `HTTP ${apiResponse.status}` : 'Erro desconhecido')

          const ambienteResolved =
            emitPayload?.ambiente ||
            emitPayload?.environment ||
            payload?.ambiente ||
            'homologacao'

          try {
            const rejectedRecord = {
              company_id: companyId,
              sale_id: saleId || null,
              external_id: payload.external_id,
              nfce_id: null,
              numero: null,
              serie: null,
              status: 'rejeitada',
              ambiente: ambienteResolved,
              valor_total: emitPayload?.itens
                ? emitPayload.itens.reduce(
                    (sum: number, item: any) =>
                      sum + Number(item.quantidade || 1) * Number(item.valor_unitario || 0),
                    0,
                  )
                : 0,
              chave_acesso: null,
              protocolo: null,
              qrcode_url: null,
              xml_url: null,
              motivo_rejeicao: String(motivo).substring(0, 1000),
              request_payload: isI9 ? emitPayload : payload,
              response_payload: result,
              contingencia_offline: false,
              contingencia_efetivada: false,
            }
            const { error: rejInsertError } = await supabase
              .from('nfce_records')
              .insert(rejectedRecord)
            if (rejInsertError) {
              console.error('[nfce-proxy] Insert rejeitada error:', rejInsertError)
            } else {
              console.log('[nfce-proxy] Registro de rejeição gravado. motivo=', motivo)
            }
          } catch (e) {
            console.error('[nfce-proxy] Falha ao persistir rejeição:', e)
          }
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
          if (d.ambiente || d.environment) {
            updateData.ambiente = d.ambiente || d.environment
          } else {
            const fromXml = ambienteFromXml(pickXmlField(d))
            if (fromXml) updateData.ambiente = fromXml
          }

          // Valor total
          if (d.valor_total || d.total || d.vNF) updateData.valor_total = d.valor_total || d.total || d.vNF

          // Contingência offline — atualiza flags quando a Focus reportar
          // efetivação retroativa (SEFAZ voltou e autorizou).
          if (d.contingencia_offline === true || d.tpEmis === 9 || String(d.forma_emissao || '') === '9') {
            updateData.contingencia_offline = true
          }
          if (d.contingencia_offline_efetivada === true || d.contingencia_efetivada === true) {
            updateData.contingencia_efetivada = true
          }

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
        console.log('[nfce-proxy] Cancelar HTTP status:', apiResponse.status, 'nfceId:', nfceId)
        console.log('[nfce-proxy] Cancelar raw result:', JSON.stringify(result).substring(0, 800))

        if (result.success) {
          await supabase.from('nfce_records')
            .update({ status: 'cancelada', updated_at: new Date().toISOString() })
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)
        }
        break
      }

      case 'reprocessar': {
        // Carrega o payload persistido na nota para permitir reprocessar com
        // ajustes fiscais (ex.: CSOSN 900) SEM consumir nova numeração.
        // O endpoint /reprocessar da Fiscal Flow reaproveita o nNF/série da nota
        // rejeitada; enviamos o payload atualizado no corpo para que a FF
        // regenere o XML com os novos dados fiscais antes de retransmitir.
        let reprocPayload: any = null
        try {
          const { data: rec } = await supabase
            .from('nfce_records')
            .select('request_payload')
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)
            .maybeSingle()
          reprocPayload = rec?.request_payload || null
        } catch (e) {
          console.error('[nfce-proxy] Reprocessar: falha ao carregar payload:', e)
        }
        console.log('[nfce-proxy] Reprocessar nfceId:', nfceId, 'com payload override:', !!reprocPayload)
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/reprocessar`, {
          method: 'POST',
          headers: {
            'x-api-key': NFCE_API_KEY,
            'Content-Type': 'application/json',
          },
          body: reprocPayload ? JSON.stringify(reprocPayload) : undefined,
        })
        result = await safeJson(apiResponse)
        console.log('[nfce-proxy] Reprocessar HTTP', apiResponse.status, 'result:', JSON.stringify(result).substring(0, 500))
        // Se a Fiscal Flow autorizar, refletimos o status no banco para o
        // Monitor exibir corretamente sem esperar novo polling.
        if (result?.success || result?.sucesso || result?.data?.aceito) {
          const data = result?.data || result
          await supabase.from('nfce_records')
            .update({
              status: 'autorizada',
              chave_acesso: data?.chave || data?.chave_acesso || null,
              protocolo: data?.protocolo || null,
              motivo_rejeicao: null,
              response_payload: result,
              updated_at: new Date().toISOString(),
            })
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)
        } else {
          await supabase.from('nfce_records')
            .update({
              motivo_rejeicao: typeof result === 'string' ? result : JSON.stringify(result).substring(0, 500),
              response_payload: result,
              updated_at: new Date().toISOString(),
            })
            .eq('nfce_id', nfceId)
            .eq('company_id', companyId)
        }
        break
      }

      case 'xml': {
        console.log('[nfce-proxy] Fetching XML for:', nfceId)
        apiResponse = await fetch(`${NFCE_API_URL}/${nfceId}/xml`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        {
          const contentType = apiResponse.headers.get('content-type') || ''
          console.log('[nfce-proxy] XML response status:', apiResponse.status, 'content-type:', contentType)
          if (!apiResponse.ok) {
            const errText = await apiResponse.text()
            console.error('[nfce-proxy] XML error response:', errText.substring(0, 300))
            result = { success: false, error: `XML endpoint retornou ${apiResponse.status}`, raw: errText.substring(0, 300) }
          } else {
            // Read as text first; try JSON, fall back to raw XML
            const rawText = await apiResponse.text()
            const trimmed = rawText.trimStart()
            let xmlText: string | null = null
            let providerJson: any = null

            if (trimmed.startsWith('<')) {
              // Provider returned raw XML directly
              xmlText = rawText
            } else {
              try { providerJson = JSON.parse(rawText) } catch { /* not JSON */ }
              if (providerJson && typeof providerJson === 'object') {
                // Try known field names for the XML payload
                const nestedData = providerJson.data && typeof providerJson.data === 'object'
                  ? providerJson.data
                  : null
                const candidate =
                  providerJson.xml_retorno ||
                  providerJson.xml ||
                  providerJson.xml_autorizado ||
                  providerJson.xmlNFe ||
                  providerJson.xml_proc ||
                  providerJson.xml_base64 ||
                  providerJson.conteudo ||
                  providerJson.content ||
                  nestedData?.xml_retorno ||
                  nestedData?.xml ||
                  nestedData?.xml_autorizado ||
                  nestedData?.xmlNFe ||
                  nestedData?.xml_proc ||
                  nestedData?.xml_base64 ||
                  nestedData?.conteudo ||
                  nestedData?.content ||
                  (typeof providerJson.data === 'string' ? providerJson.data : null) ||
                  null

                if (candidate && typeof candidate === 'string') {
                  xmlText = candidate.trimStart().startsWith('<')
                    ? candidate
                    : (() => { try { return atob(candidate) } catch { return candidate } })()
                } else {
                  // Follow URL server-side to bypass CORS
                  const url = providerJson.xml_url || providerJson.url_xml || providerJson.url || nestedData?.xml_url || nestedData?.url_xml || nestedData?.url || null
                  if (url) {
                    try {
                      const r2 = await fetch(url, { headers: { 'x-api-key': NFCE_API_KEY } })
                      const t = await r2.text()
                      if (r2.ok) xmlText = t
                    } catch (e) {
                      console.error('[nfce-proxy] XML url follow error:', e)
                    }
                  }
                }
              } else if (rawText.trim().length > 0) {
                // Not JSON, not obvious XML — try base64 decode
                try {
                  const dec = atob(rawText.trim())
                  if (dec.trimStart().startsWith('<')) xmlText = dec
                } catch { /* ignore */ }
              }
            }

            if (xmlText) {
              result = { success: true, xml: xmlText }
              // Cache no banco para relatórios (Espelho Fiscal, backfill etc.)
              try {
                await supabase
                  .from('nfce_records')
                  .update({ xml_content: xmlText, updated_at: new Date().toISOString() })
                  .eq('nfce_id', nfceId)
                  .eq('company_id', companyId)
              } catch (e) {
                console.error('[nfce-proxy] xml cache error:', e)
              }
            } else {
              console.error('[nfce-proxy] XML unrecognized shape:', rawText.substring(0, 400))
              result = {
                success: false,
                error: 'Provider retornou XML em formato não reconhecido.',
                raw: rawText.substring(0, 500),
              }
            }
          }
        }
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

      case 'inutilizar': {
        // Inutiliza uma faixa de numeração NFC-e. Cria registro local em
        // `nfce_inutilizacoes` com status 'pendente', chama a Fiscal Flow e
        // atualiza o status conforme resposta.
        const serie = String(payload?.serie ?? '').trim()
        const numero_inicial = Number(payload?.numero_inicial)
        const numero_final = Number(payload?.numero_final)
        const ano = Number(payload?.ano ?? new Date().getFullYear())
        const justificativa = String(payload?.justificativa ?? '').trim()

        if (!serie || !Number.isInteger(numero_inicial) || !Number.isInteger(numero_final)
          || numero_final < numero_inicial || justificativa.length < 15) {
          return new Response(
            JSON.stringify({ error: 'Dados inválidos. Justificativa deve ter ao menos 15 caracteres.' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // A rota oficial atual da Fiscal Flow identifica o emitente pelo token,
        // não pelo CNPJ no body. Portanto, CNPJ ausente no cadastro local não
        // pode bloquear a inutilização. Ele é buscado apenas para fallbacks
        // legados que ainda exigem CNPJ/ano.
        let cnpj = ''
        try {
          const { data: companyRow, error: companyErr } = await supabase
            .from('companies')
            .select('cnpj')
            .eq('id', companyId)
            .maybeSingle()
          if (companyErr) {
            console.warn('[nfce-proxy] Inutilizar: não foi possível carregar CNPJ para fallback legado:', companyErr.message)
          }
          cnpj = String(companyRow?.cnpj ?? '').replace(/\D/g, '')
        } catch (e) {
          console.warn('[nfce-proxy] Inutilizar: erro ao carregar CNPJ para fallback legado:', e)
        }

        // Formato oficial Fiscal Flow (rota /inutilizar):
        //   { serie: int, numero_inicial: int, numero_final?: int, justificativa: string }
        // Mantemos o body oficial estrito nas rotas novas; os campos extras
        // ficam apenas para fallbacks legados, evitando validação 400/422 por
        // parâmetros inesperados no gateway atual.
        const officialReqBody: Record<string, unknown> = {
          serie: Number(serie),
          numero_inicial,
          numero_final,
          justificativa,
        }
        const legacyReqBody: Record<string, unknown> = {
          ...officialReqBody,
          ...(cnpj.length === 14 ? { cnpj } : {}),
          ano,
        }
        const { data: inserted, error: insErr } = await supabase
          .from('nfce_inutilizacoes')
          .insert({
            company_id: companyId,
            serie,
            numero_inicial,
            numero_final,
            ano,
            justificativa,
            status: 'pendente',
            request_payload: officialReqBody,
            created_by: userId,
          })
          .select('id')
          .single()
        if (insErr) {
          return new Response(JSON.stringify({ error: 'Falha ao registrar: ' + insErr.message }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
        }

        // Focus NFe usa exatamente /v2/nfce/inutilizacao para NFC-e.
        // Algumas instalações configuram NFCE_API_URL como a base /nfce; outras
        // como uma rota de emissão. Geramos candidatos sem expor a URL em log.
        const baseUrl = NFCE_API_URL.replace(/\/+$/, '')
        // Fiscal Flow expõe /inutilizar tanto em /nfce-api quanto em /nfe-api.
        // Como a numeração é da NFC-e, priorizamos o path nfce; a NF-e fica
        // como fallback caso o gateway compartilhe a rota.
        const rootUrl = baseUrl.replace(/\/(nfce|nfe)(?:-api)?(?:\/.*)?$/i, '')
        const rawAttempts: Array<[string, Record<string, unknown>]> = [
          [`${baseUrl}/inutilizar`, officialReqBody],
          [`${rootUrl}/nfce-api/inutilizar`, officialReqBody],
          [`${rootUrl}/nfe-api/inutilizar`, officialReqBody],
          [`${baseUrl}/inutilizacao`, legacyReqBody],
          [`${rootUrl}/nfce/inutilizar`, legacyReqBody],
          [`${rootUrl}/nfe/inutilizacao`, legacyReqBody],
          [`${rootUrl}/inutilizar`, officialReqBody],
          [`${rootUrl}/inutilizacao`, legacyReqBody],
        ]
        const inutilizacaoAttempts = Array.from(new Map(
          rawAttempts.filter(([url, attemptBody]) => {
            if (!url) return false
            const isLegacyBody = attemptBody === legacyReqBody
            return !isLegacyBody || cnpj.length === 14
          })
        ).entries())
        const apiHeaders = {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'x-api-key': NFCE_API_KEY,
          'Authorization': `Bearer ${NFCE_API_KEY}`,
        }

        let lastResult: any = null
        const attempts: Array<{ path: string; status: number; body?: any }> = []
        for (const [url, attemptBody] of inutilizacaoAttempts) {
          apiResponse = await fetch(url, {
            method: 'POST',
            headers: apiHeaders,
            body: JSON.stringify(attemptBody),
          })
          lastResult = await safeJson(apiResponse)
          // Loga só o path para não expor o host em logs.
          let pathOnly = url
          try { pathOnly = new URL(url).pathname } catch { /* keep */ }
          attempts.push({ path: pathOnly, status: apiResponse.status, body: lastResult })
          console.log('[nfce-proxy] inutilizar attempt', pathOnly, '→', apiResponse.status)
          // Só continua tentando outras rotas quando o gateway responde
          // 404 (rota inexistente). Qualquer outro status (200/400/422/502)
          // significa que a rota existe e devemos usar a resposta.
          if (apiResponse.status !== 404) break
        }
        result = lastResult

        const ok = apiResponse.ok && (result?.success !== false)
        const newStatus = ok ? 'aceita' : 'rejeitada'
        const protocolo = result?.protocolo_sefaz ?? result?.protocolo ?? result?.data?.protocolo ?? result?.data?.protocolo_sefaz ?? null
        const motivo = ok ? null : (result?.error || result?.message || result?.mensagem_sefaz || 'Rejeitado pela SEFAZ')
        const debugResult = ok ? result : { ...result, _attempts: attempts }

        await supabase.from('nfce_inutilizacoes')
          .update({
            status: newStatus,
            protocolo,
            response_payload: debugResult,
            motivo_rejeicao: motivo,
            external_id: result?.id ?? result?.data?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', inserted.id)

        result = { ...result, inutilizacao_id: inserted.id, status: newStatus }
        // Rejeição de inutilização é resposta de negócio, não falha técnica da
        // edge function. Forçamos 200 para o frontend conseguir mostrar o
        // motivo real em vez de "Edge Function returned a non-2xx status code".
        apiResponse = new Response(null, { status: 200 })
        break
      }

      case 'recuperar_por_chave': {
        // Recupera na FiscalFlow uma NFC-e já AUTORIZADA no SEFAZ a partir da
        // chave de 44 dígitos e atualiza o registro local (`nfce_records`) que
        // ficou como "rejeitada" por duplicidade/timeout. Uso típico: quando o
        // SEFAZ autorizou a nota, mas a resposta se perdeu, gerando rejeição
        // 539 (duplicidade) na retransmissão.
        const chave = String(payload?.chave_acesso ?? '').replace(/\D/g, '')
        const localRecordId = payload?.record_id ?? null
        if (chave.length !== 44) {
          return new Response(
            JSON.stringify({ error: 'Chave de acesso inválida (esperado 44 dígitos numéricos).' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // 1) Localiza na FiscalFlow via `listar?chave_acesso=`
        console.log('[nfce-proxy] Recuperar por chave:', chave)
        const listResp = await fetch(`${NFCE_API_URL}?chave_acesso=${chave}`, {
          headers: { 'x-api-key': NFCE_API_KEY },
        })
        const listData = await safeJson(listResp)
        const items: any[] = Array.isArray(listData)
          ? listData
          : (listData?.data || listData?.notas || listData?.items || [])
        let match = items.find((it: any) =>
          (it?.chave_acesso || it?.chave || it?.chnfe || '') === chave
        ) || items[0]

        // 2) Se veio só um resumo (sem status/protocolo), busca detalhe pelo id
        let d: any = match || null
        const remoteId = d?.id || d?.nfce_id
        if (remoteId && (!d?.protocolo && !d?.status)) {
          const detResp = await fetch(`${NFCE_API_URL}/${remoteId}`, {
            headers: { 'x-api-key': NFCE_API_KEY },
          })
          const detData = await safeJson(detResp)
          d = detData?.data || detData || d
        }

        if (!d || (!d.protocolo && !d.status && !d.chave_acesso)) {
          apiResponse = listResp
          result = {
            success: false,
            error: 'Nenhuma NFC-e encontrada na FiscalFlow para esta chave.',
            raw: listData,
          }
          break
        }

        // 3) Monta update do registro local
        const fromChaveRec = extractFromChave(chave)
        const proto = d.protocolo || d.protocol || d.nProt || null
        const ambienteRec = d.ambiente || d.environment || ambienteFromXml(pickXmlField(d)) || null
        const qr = d.qrcode_url || d.qr_code_url || d.url_qrcode || d.qrcode || d.qr_code || d.url_consulta_qrcode
                   || buildQrcodeUrl(chave, ambienteRec || 'producao')
        const statusResolved = (d.status || d.situacao || 'autorizada').toString().toLowerCase()

        const updateData: Record<string, any> = {
          status: statusResolved.includes('autoriz') ? 'autorizada' : statusResolved,
          chave_acesso: chave,
          protocolo: proto,
          // A chave de acesso é a fonte autoritativa do nº/série da nota
          // autorizada no SEFAZ. Priorizamos os dados extraídos dela para
          // evitar herdar o número antigo do stub local (que pode ter sido
          // enviado com um contador diferente antes da rejeição 539).
          numero: fromChaveRec.numero || d.numero || d.number || null,
          serie: fromChaveRec.serie || d.serie || d.series || null,
          ambiente: ambienteRec,
          qrcode_url: qr,
          xml_url: d.xml_url || d.url_xml || null,
          nfce_id: remoteId || null,
          motivo_rejeicao: null,
          webhook_payload: { recovered_from: 'recuperar_por_chave', response: d },
          updated_at: new Date().toISOString(),
        }

        let updQuery = supabase.from('nfce_records').update(updateData).eq('company_id', companyId)
        if (localRecordId) {
          updQuery = updQuery.eq('id', localRecordId)
        } else {
          updQuery = updQuery.eq('chave_acesso', chave)
        }
        const { error: updErr, data: updRows } = await updQuery.select('id')
        if (updErr) {
          apiResponse = listResp
          result = { success: false, error: 'Falha ao atualizar registro local: ' + updErr.message }
          break
        }

        apiResponse = listResp
        result = {
          success: true,
          updated: updRows?.length ?? 0,
          record: updateData,
          message: 'NFC-e recuperada e sincronizada com o SEFAZ.',
        }
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
