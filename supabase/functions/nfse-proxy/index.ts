// Edge function: nfse-proxy
// Proxy isolado da Fiscal Flow para NFS-e Nacional (padrão SEFIN/ADN), rota
// `nfse-api`. NÃO compartilha código com `nfce-proxy`/`nfe-proxy` -- segue o
// mesmo padrão de isolamento já usado nesses dois (clonado em estrutura
// mínima pra garantir que alterações aqui não impactem NF-e/NFC-e).
//
// Não falamos direto com prefeitura/SEFIN/ADN e não montamos XML aqui -- só
// montamos um JSON simples e repassamos à Fiscal Flow, que já valida o token
// da empresa e fala com a API2/SEFIN. Contrato confirmado no código do Emit
// Smart (outro sistema que já usa essa mesma rota em produção).
//
// Ações: `emitir`, `consultar`, `cancelar`, `pdf`, `xml`, `pre-validacao`.
// Mesmo token Fiscal Flow já salvo em `store_settings.fiscal_flow_api_token`
// (fallback: env `NFCE_API_KEY`).

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveNfseApiUrl } from '../_shared/fiscal-api-url.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

/** Troca rejeições conhecidas da SEFIN por orientação que o usuário consegue seguir. */
function traduzirErro(erro: string): string {
  const m = erro.match(/\[(\d{1,4})\]/)
  if (!m) return erro
  switch (Number(m[1])) {
    case 160:
      return 'O enquadramento da empresa (MEI/Simples Nacional) está diferente do cadastro na Receita Federal. Corrija o regime em Fiscal → NFS-e e avise o suporte. (SEFIN 160)'
    case 310:
      return 'O código de tributação nacional escolhido não existe na lista oficial de serviços. Escolha outro código de serviço. (SEFIN 310)'
    case 855:
    case 1235:
      return `Falha de configuração do sistema, não é erro de preenchimento. Avise o suporte informando o código SEFIN ${m[1]}.`
    default:
      return erro
  }
}

/** Monta o corpo da emissão a partir do payload da tela, removendo campos vazios
 * (mesma regra do NfseProxyService::buildEmitPayload do Emit Smart). */
function buildEmitPayload(payload: any, defaults: { serie?: string | null }) {
  const notEmpty = (v: any) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)
  const filterObj = (obj: Record<string, any>) => {
    const out: Record<string, any> = {}
    for (const [k, v] of Object.entries(obj)) if (notEmpty(v)) out[k] = v
    return out
  }

  const tomador = payload?.tomador || {}
  const servico = payload?.servico || {}
  const valores = payload?.valores || {}

  const doc = String(tomador.documento || tomador.cpf || tomador.cnpj || '').replace(/\D/g, '')
  const nome = String(tomador.nome || '').trim()
  if (!doc || !nome) throw new Error('Tomador (documento e nome) é obrigatório.')

  const disc = String(servico.discriminacao || '').trim()
  if (disc.length < 10) throw new Error('Descrição do serviço deve ter no mínimo 10 caracteres.')

  const cMun = String(servico.codigo_municipio_prestacao || '').replace(/\D/g, '')
  if (cMun.length !== 7) throw new Error('Município de prestação (IBGE 7 dígitos) é obrigatório.')

  const vServ = Number(valores.valor_servicos) || 0
  if (vServ <= 0) throw new Error('Valor do serviço deve ser maior que zero.')

  const deducoes = (Number(valores.deducoes) || 0) + (Number(valores.desconto) || 0)
  const aliquota = Number(valores.aliquota) || 0

  const cTribNac = String(servico.c_trib_nac || '').replace(/\D/g, '')
  const cNBS = String(servico.c_nbs || '').replace(/\D/g, '')
  const cTribMun = String(servico.c_trib_mun || '').replace(/\D/g, '')

  const end = tomador.endereco || null
  const endereco = end
    ? filterObj({
        logradouro: end.logradouro,
        numero: end.numero,
        bairro: end.bairro,
        codigoMunicipioIbge: String(end.codigoMunicipioIbge || '').replace(/\D/g, '') || null,
        uf: end.uf,
        cep: String(end.cep || '').replace(/\D/g, '') || null,
        complemento: end.complemento,
      })
    : null

  return {
    external_id: payload?.external_id ?? null,
    serie: String(payload?.serie || defaults.serie || '1').trim() || '1',
    tomador: filterObj({
      documento: doc,
      nome,
      email: tomador.email,
      im: tomador.im,
      endereco,
    }),
    servico: filterObj({
      discriminacao: disc,
      codigo_municipio_prestacao: cMun,
      c_trib_nac: cTribNac.length === 6 ? cTribNac : null,
      c_nbs: cNBS.length === 9 ? cNBS : null,
      c_trib_mun: cTribMun || null,
      c_ind_op: servico.c_ind_op,
    }),
    valores: filterObj({
      valor_servicos: Math.round(vServ * 100) / 100,
      deducoes: Math.round(deducoes * 100) / 100,
      aliquota: aliquota > 0 ? Math.round(aliquota * 100) / 100 : null,
      iss_retido: !!valores.iss_retido,
    }),
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const NFSE_API_URL = resolveNfseApiUrl()

    const body = await req.json()
    const { action, companyId, recordId, payload } = body as {
      action: string
      companyId: string
      recordId?: string
      payload?: any
    }

    const { data: belongs } = await supabase.rpc('user_belongs_to_company', {
      _user_id: user.id,
      _company_id: companyId,
    })
    if (!belongs) {
      return new Response(JSON.stringify({ error: 'Acesso negado' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Token por empresa (mesmo da NFC-e/NF-e); fallback global
    let NFSE_API_KEY: string | null = Deno.env.get('NFCE_API_KEY') ?? null
    const { data: tokenRow } = await supabase
      .from('store_settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'fiscal_flow_api_token')
      .maybeSingle()
    const perCompanyToken = (tokenRow?.value || '').trim()
    if (perCompanyToken) NFSE_API_KEY = perCompanyToken

    if (!NFSE_API_KEY && action !== 'pre-validacao') {
      return new Response(
        JSON.stringify({ error: 'Token Fiscal Flow ausente. Configure em Fiscal → Token da API.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      )
    }

    const apiHeaders = {
      'x-api-key': NFSE_API_KEY || '',
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    }

    async function safeJson(resp: Response): Promise<any> {
      const text = await resp.text()
      try { return JSON.parse(text) } catch {
        return { success: false, error: `API retornou resposta inválida (status ${resp.status})`, raw: text.substring(0, 500) }
      }
    }

    let apiResponse: Response
    let result: any

    switch (action) {
      case 'pre-validacao': {
        const { data: settings } = await supabase
          .from('pdv_settings')
          .select('nfse_ambiente, nfse_regime_tributario')
          .eq('company_id', companyId)
          .maybeSingle()
        const { data: companyRow } = await supabase
          .from('companies')
          .select('cnpj')
          .eq('id', companyId)
          .maybeSingle()

        const problemas: Array<{ nivel: 'erro' | 'aviso'; campo: string; mensagem: string }> = []

        if (!NFSE_API_KEY) {
          problemas.push({ nivel: 'erro', campo: 'token', mensagem: 'O token da Fiscal Flow não está configurado. Configure em Fiscal → Token da API.' })
        }

        const cnpjDigits = String(companyRow?.cnpj || '').replace(/\D/g, '')
        const regimeCadastrado = (settings?.nfse_regime_tributario || '').toLowerCase()
        if (cnpjDigits.length === 14 && regimeCadastrado) {
          try {
            const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
              headers: { Accept: 'application/json' },
            })
            if (r.ok) {
              const j = await r.json()
              const isMei = j?.opcao_pelo_mei === true && !j?.data_exclusao_do_mei
              const isSimples = j?.opcao_pelo_simples === true && !j?.data_exclusao_do_simples
              const esperado = isMei ? 'mei' : (isSimples ? 'simples_nacional' : 'normal')
              if (esperado !== regimeCadastrado) {
                const nomes: Record<string, string> = { mei: 'MEI', simples_nacional: 'Simples Nacional', normal: 'Lucro Presumido/Real' }
                problemas.push({
                  nivel: 'erro',
                  campo: 'regime',
                  mensagem: `Na Receita Federal esta empresa é ${nomes[esperado]}, mas o regime cadastrado é diferente. A SEFIN rejeita a nota com o erro 160. Corrija em Fiscal → NFS-e.`,
                })
              }
            }
          } catch {
            // BrasilAPI fora do ar não bloqueia a emissão, só não valida.
          }
        }

        if ((settings?.nfse_ambiente || 'homologacao') !== 'producao') {
          problemas.push({ nivel: 'aviso', campo: 'ambiente', mensagem: 'Ambiente de homologação: a nota emitida não tem validade fiscal.' })
        }

        return new Response(JSON.stringify({ ok: true, problemas }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'emitir': {
        const { data: settings } = await supabase
          .from('pdv_settings')
          .select('nfse_serie, nfse_ambiente')
          .eq('company_id', companyId)
          .maybeSingle()

        let emitPayload: any
        try {
          emitPayload = buildEmitPayload(payload, { serie: settings?.nfse_serie })
        } catch (e) {
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        console.log('[nfse-proxy] Emitir NFS-e, URL:', NFSE_API_URL)
        console.log('[nfse-proxy] payload:', JSON.stringify(emitPayload).substring(0, 1500))

        apiResponse = await fetch(NFSE_API_URL, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify(emitPayload),
        })
        result = await safeJson(apiResponse)

        const ok = apiResponse.ok && (result?.success ?? false) === true && !!result?.data
        const d = result?.data || {}
        const erroMsg = ok ? null : traduzirErro(String(result?.error || d?.message || 'Falha ao emitir NFS-e'))

        const insertPayload: any = {
          company_id: companyId,
          external_id: String(d?.id || emitPayload.external_id || crypto.randomUUID()),
          api_id: d?.id ? String(d.id) : null,
          numero_dps: d?.numero_dps ? String(d.numero_dps) : null,
          numero_nfse: d?.numero_nfse ? String(d.numero_nfse) : null,
          serie: d?.serie ? String(d.serie) : emitPayload.serie,
          chave_acesso: d?.chave_acesso || null,
          protocolo: d?.protocolo || null,
          status: ok ? (d?.status || 'processada') : 'rejeitada',
          ambiente: settings?.nfse_ambiente || 'homologacao',
          codigo_retorno: d?.codigo_retorno ? String(d.codigo_retorno) : null,
          motivo_retorno: ok ? (d?.motivo_retorno || null) : erroMsg,
          valor_servicos: Number(d?.valor_servicos ?? emitPayload.valores.valor_servicos),
          tomador: emitPayload.tomador,
          servico: emitPayload.servico,
          xml_nfse: typeof d?.xml_nfse === 'string' ? d.xml_nfse : null,
          request_payload: emitPayload,
          response_payload: result,
          created_by: user.id,
        }
        const { data: inserted } = await supabase
          .from('nfse_records')
          .insert(insertPayload)
          .select('id')
          .single()

        if (!ok) {
          return new Response(JSON.stringify({ ok: false, recordId: inserted?.id, error: erroMsg, result }), {
            status: 422,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }

        return new Response(JSON.stringify({ ok: true, recordId: inserted?.id, result }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'consultar': {
        if (!recordId) return new Response(JSON.stringify({ error: 'recordId obrigatório' }), { status: 400, headers: corsHeaders })
        const { data: nfse } = await supabase.from('nfse_records').select('api_id').eq('id', recordId).eq('company_id', companyId).maybeSingle()
        if (!nfse?.api_id) return new Response(JSON.stringify({ error: 'NFS-e sem identificador da API (não autorizada).' }), { status: 400, headers: corsHeaders })

        apiResponse = await fetch(`${NFSE_API_URL}/${nfse.api_id}/consultar`, { method: 'POST', headers: apiHeaders, body: '{}' })
        result = await safeJson(apiResponse)
        if (apiResponse.ok && result?.success && result?.data) {
          const d = result.data
          const patch: any = {}
          if (['autorizada', 'cancelada'].includes(d.status)) patch.status = d.status
          if (d.motivo_retorno) patch.motivo_retorno = d.motivo_retorno
          if (d.codigo_retorno) patch.codigo_retorno = String(d.codigo_retorno)
          if (Object.keys(patch).length) await supabase.from('nfse_records').update(patch).eq('id', recordId)
        }
        return new Response(JSON.stringify(result), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'cancelar': {
        if (!recordId) return new Response(JSON.stringify({ error: 'recordId obrigatório' }), { status: 400, headers: corsHeaders })
        const { data: nfse } = await supabase.from('nfse_records').select('api_id').eq('id', recordId).eq('company_id', companyId).maybeSingle()
        if (!nfse?.api_id) return new Response(JSON.stringify({ error: 'NFS-e sem identificador da API (não autorizada).' }), { status: 400, headers: corsHeaders })

        apiResponse = await fetch(`${NFSE_API_URL}/${nfse.api_id}/cancelar`, {
          method: 'POST',
          headers: apiHeaders,
          body: JSON.stringify({ justificativa: payload?.justificativa || '', motivo: payload?.motivo ?? 1 }),
        })
        result = await safeJson(apiResponse)
        if (apiResponse.ok && result?.success) {
          await supabase.from('nfse_records').update({
            status: 'cancelada',
            motivo_retorno: result?.data?.motivo_retorno || payload?.justificativa || null,
          }).eq('id', recordId)
        }
        return new Response(JSON.stringify(result), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'pdf': {
        if (!recordId) return new Response(JSON.stringify({ error: 'recordId obrigatório' }), { status: 400, headers: corsHeaders })
        const { data: nfse } = await supabase.from('nfse_records').select('api_id').eq('id', recordId).eq('company_id', companyId).maybeSingle()
        if (!nfse?.api_id) return new Response(JSON.stringify({ error: 'NFS-e sem identificador da API (não autorizada).' }), { status: 400, headers: corsHeaders })

        apiResponse = await fetch(`${NFSE_API_URL}/${nfse.api_id}/pdf?formato=json`, { headers: apiHeaders })
        result = await safeJson(apiResponse)
        const b64 = result?.data?.pdf_base64 || result?.pdf_base64 || result?.data?.base64 || result?.base64 || null
        return new Response(JSON.stringify({ success: !!b64, pdf_base64: b64, error: b64 ? undefined : (result?.error || 'A API não devolveu o PDF da NFS-e.') }), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      case 'xml': {
        if (!recordId) return new Response(JSON.stringify({ error: 'recordId obrigatório' }), { status: 400, headers: corsHeaders })
        const { data: nfse } = await supabase.from('nfse_records').select('api_id, xml_nfse').eq('id', recordId).eq('company_id', companyId).maybeSingle()
        if (nfse?.xml_nfse) {
          return new Response(JSON.stringify({ success: true, xml_base64: btoa(unescape(encodeURIComponent(nfse.xml_nfse))) }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
        if (!nfse?.api_id) return new Response(JSON.stringify({ error: 'NFS-e sem identificador da API (não autorizada).' }), { status: 400, headers: corsHeaders })

        apiResponse = await fetch(`${NFSE_API_URL}/${nfse.api_id}/xml`, { headers: apiHeaders })
        const xmlText = await apiResponse.text()
        if (apiResponse.ok && xmlText.trim()) {
          await supabase.from('nfse_records').update({ xml_nfse: xmlText }).eq('id', recordId)
        }
        return new Response(JSON.stringify({ success: apiResponse.ok, xml_base64: apiResponse.ok ? btoa(unescape(encodeURIComponent(xmlText))) : undefined, error: apiResponse.ok ? undefined : 'Falha ao baixar XML' }), {
          status: apiResponse.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }

      default:
        return new Response(JSON.stringify({ error: `Ação desconhecida: ${action}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
  } catch (err) {
    console.error('[nfse-proxy] erro inesperado:', err)
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
