import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEF_API_URL = 'https://api.multipluscard.com.br/api/Servicos';

// Separator character used in CONTEUDO header
const SEP = '¬';

// ===== TEF v1.2 (homologação Multiplus) =====
// Comportamento novo isolado para a Lancheria da i9 enquanto valida com a Multiplus.
// Quando o teste passar, removemos este guard e aplicamos para todos.
const I9_COMPANY_ID = '8c9e7a0e-dbb6-49b9-8344-c23155a71164';
function isI9(companyId: unknown): boolean {
  return typeof companyId === 'string' && companyId === I9_COMPANY_ID;
}

// Build CONTEUDO string from key-value pairs
// IMPORTANT: 999-999 MUST always be the LAST field
function buildConteudo(fields: Record<string, string>): string {
  const entries = Object.entries(fields);
  // Separate 999-999 and put it last
  const regular = entries.filter(([key]) => key !== '999-999');
  const terminator = entries.find(([key]) => key === '999-999');
  const ordered = terminator ? [...regular, terminator] : regular;
  return ordered
    .map(([key, value]) => `${key} = ${value}`)
    .join(SEP);
}

// Parse TEF response string into key-value map
function parseResponse(response: string): Record<string, string> {
  const fields: Record<string, string> = {};
  if (!response) return fields;
  
  const parts = response.split(SEP);
  for (const part of parts) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.substring(0, eqIndex).trim();
    const value = part.substring(eqIndex + 1).trim();
    fields[key] = value;
  }
  return fields;
}

// Extract receipt lines from parsed response
function extractReceipt(parsed: Record<string, string>): string[] {
  const lines: string[] = [];
  const totalLines = parseInt(parsed['028-000'] || '0');
  for (let i = 1; i <= totalLines; i++) {
    const key = `029-${String(i).padStart(3, '0')}`;
    if (parsed[key] !== undefined) {
      lines.push(parsed[key].replace(/^"|"$/g, ''));
    }
  }
  return lines;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, token, cnpj, pdv, ...params } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ success: false, errorMessage: 'Token TEF WebService não informado' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      );
    }

    // ATV - Check if Gerenciador Padrão is active
    if (action === 'atv') {
      if (!cnpj || !pdv) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'CNPJ e PDV são obrigatórios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const conteudo = buildConteudo({
        '000-000': 'ATV',
        '001-000': '1',
        '999-999': '0',
      });

      const response = await fetch(`${TEF_API_URL}/SetVendaTef`, {
        method: 'POST',
        headers: {
          'CNPJ': cnpj,
          'PDV': pdv,
          'TOKEN': token,
          'CONTEUDO': conteudo,
        },
      });

      const text = await response.text();
      console.log('[TEF-WS] ATV response:', text);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: `Erro ATV: ${response.status} - ${text}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (text.startsWith('[ERRO]')) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const hash = text.trim();

      await new Promise(resolve => setTimeout(resolve, 600));
      
      const getResponse = await fetch(`${TEF_API_URL}/GetVendasTef`, {
        method: 'GET',
        headers: {
          'HASH': hash,
          'TOKEN': token,
        },
      });

      const getResult = await getResponse.text();
      console.log('[TEF-WS] ATV GET result:', getResult);

      if (getResult === 'Pendente' || getResult === 'Processando') {
        return new Response(
          JSON.stringify({ success: true, active: true, status: getResult }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const parsed = parseResponse(getResult);
      const status = parsed['009-000'];

      return new Response(
        JSON.stringify({
          success: status === '0' || status === undefined,
          active: true,
          hash,
          message: parsed['030-000'] || 'Gerenciador ativo',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRT - Create card transaction
    if (action === 'crt') {
      if (!cnpj || !pdv) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'CNPJ e PDV são obrigatórios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { amount, identificacao, documentoFiscal, paymentType, installments, equipment } = params;

      if (!amount) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'Valor não informado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const ident = identificacao || String(Date.now());

      // Build CONTEUDO fields - 999-999 will be placed last by buildConteudo
      const fields: Record<string, string> = {
        '000-000': 'CRT',
        '001-000': ident,
        '003-000': String(Math.round(amount * 100)),
      };

      if (documentoFiscal) {
        fields['002-000'] = documentoFiscal;
      }

      if (paymentType !== undefined && paymentType !== null) {
        fields['800-001'] = String(paymentType);
      }

      if (installments && installments > 1) {
        fields['800-002'] = '1'; // Parcelado
        // Guia Multiplus: 0 = Parcelado ADM (juros do cliente) | 1 = Parcelado Loja (juros da loja)
        fields['800-003'] = params.installmentType === 'adm' ? '0' : '1';
        fields['800-004'] = String(installments);
      } else if (paymentType !== undefined) {
        fields['800-002'] = '0'; // À vista
        // Lancheria I9 (homologação Multiplus i9 v1.2): para Débito à vista (800-001=1)
        // o Gerenciador Padrão não abre se 800-003 estiver ausente. Enviamos '0'
        // (sem juros) para destravar. Isolado para I9 até validar nas demais lojas.
        if (isI9(params.companyId) && Number(paymentType) === 1) {
          fields['800-003'] = '0';
        }
      }

      if (cnpj) {
        fields['800-005'] = cnpj;
      }

      fields['800-006'] = String(equipment || 1);
      fields['999-999'] = '0';

      const conteudo = buildConteudo(fields);
      console.log('[TEF-WS] CRT CONTEUDO:', conteudo);

      const headers: Record<string, string> = {
        'CNPJ': cnpj,
        'PDV': pdv,
        'TOKEN': token,
        'CONTEUDO': conteudo,
      };

      const callbackUrl = params.callbackUrl;
      if (callbackUrl) {
        headers['CALLBACK'] = callbackUrl;
      }

      const response = await fetch(`${TEF_API_URL}/SetVendaTef`, {
        method: 'POST',
        headers,
      });

      const text = await response.text();
      console.log('[TEF-WS] CRT response:', text);

      if (!response.ok) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: `Erro CRT: ${response.status} - ${text}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (text.startsWith('[ERRO]')) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const hash = text.trim();
      // Return the identificacao used so the client can reuse it for CNF/NCN
      return new Response(
        JSON.stringify({ success: true, hash, identificacao: ident }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // GET - Poll transaction status
    if (action === 'get-status') {
      const { hash } = params;
      if (!hash) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'Hash não informado' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const getHeaders: Record<string, string> = {
        'HASH': hash,
        'TOKEN': token,
      };
      if (cnpj) getHeaders['CNPJ'] = cnpj;
      if (pdv) getHeaders['PDV'] = pdv;

      const response = await fetch(`${TEF_API_URL}/GetVendasTef`, {
        method: 'GET',
        headers: getHeaders,
      });

      const text = await response.text();
      console.log('[TEF-WS] GET response:', text.substring(0, 200));

      if (!response.ok) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: `Erro GET: ${response.status}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (text.startsWith('[ERRO]')) {
        return new Response(
          JSON.stringify({ success: false, status: 'error', errorMessage: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (text === 'Pendente') {
        return new Response(
          JSON.stringify({ success: false, status: 'pending' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (text === 'Processando') {
        return new Response(
          JSON.stringify({ success: false, status: 'processing' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (text === 'Cancelado') {
        return new Response(
          JSON.stringify({ success: false, status: 'cancelled', errorMessage: 'Transação cancelada' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Parse the full response
      const parsed = parseResponse(text);
      const transactionStatus = parsed['009-000'];
      const isApproved = transactionStatus === '0';

      // Extract clean acquirer name from 010-000 (may contain "REDE | Crédito | [COMPROVANTE]...")
      const raw010 = parsed['010-000'] || parsed['010-010'] || '';
      const cleanAcquirer = raw010.includes('|') ? raw010.split('|')[0].trim() : raw010.split('[')[0].trim();

      const result: Record<string, unknown> = {
        success: isApproved,
        status: isApproved ? 'approved' : 'declined',
        raw: parsed,
        identificacao: parsed['001-000'] || '',
        nsu: parsed['012-000'] || parsed['012-001'] || '',
        authorizationCode: parsed['013-000'] || parsed['013-001'] || '',
        nsuHost: parsed['170-000'] || '',
        acquirer: cleanAcquirer,
        acquirerFull: raw010,
        acquirerCnpj: parsed['010-001'] || parsed['010-011'] || '',
        acquirerSatCode: parsed['010-002'] || parsed['010-012'] || '',
        transactionType: parsed['011-000'] || parsed['011-001'] || '',
        cardBrand: parsed['040-000'] || parsed['040-001'] || '',
        cardNumber: parsed['740-000'] || '',
        cardHolderName: parsed['741-000'] || '',
        installments: parsed['018-000'] || '1',
        transactionDate: parsed['022-000'] || '',
        transactionTime: parsed['023-000'] || '',
        finalizacao: parsed['027-000'] || '',
        operatorMessage: parsed['030-000'] || '',
        clientMessage: parsed['031-000'] || '',
        receiptLines: extractReceipt(parsed),
        totalReceiptLines: parseInt(parsed['028-000'] || '0'),
      };

      if (!isApproved) {
        result.errorMessage = parsed['030-000'] || 'Transação não aprovada';
      }

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CNF - Confirm transaction
    if (action === 'cnf') {
      if (!cnpj || !pdv) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'CNPJ e PDV são obrigatórios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { identificacao, rede, nsu, finalizacao } = params;

      // ============================================================
      // CNF (Confirmação)
      // A Multiplus apontou: o CNF DEVE usar o MESMO 001-000 da
      // operação que está sendo confirmada (CRT, CNC ou ADM).
      // Para a Lancheria da i9: validar que identificacao foi passada
      // e nunca gerar um novo ID.
      // ============================================================
      if (isI9(params.companyId) && !identificacao) {
        console.error('[TEF-WS] CNF rejeitado: identificacao ausente (i9 v1.2)');
        return new Response(
          JSON.stringify({
            success: false,
            errorMessage: 'CNF requer identificacao da operação original',
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      // Field order: 000-000, 001-000, 010-000, 012-000, 027-000, 999-999
      // 999-999 is always placed last by buildConteudo
      const fields: Record<string, string> = {
        '000-000': 'CNF',
        '001-000': String(identificacao || '1'),
      };

      if (rede) fields['010-000'] = rede;
      if (nsu) fields['012-000'] = nsu;
      fields['027-000'] = finalizacao || '';
      fields['999-999'] = '0';

      const conteudo = buildConteudo(fields);
      console.log(`[TEF-WS] CNF CONTEUDO (ident=${identificacao}):`, conteudo);

      const response = await fetch(`${TEF_API_URL}/SetVendaTef`, {
        method: 'POST',
        headers: {
          'CNPJ': cnpj,
          'PDV': pdv,
          'TOKEN': token,
          'CONTEUDO': conteudo,
        },
      });

      const text = await response.text();
      console.log('[TEF-WS] CNF response:', text);

      return new Response(
        JSON.stringify({ success: response.ok && !text.startsWith('[ERRO]'), message: text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // NCN - Non-confirmation (undo/cancel transaction)
    if (action === 'ncn') {
      if (!cnpj || !pdv) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'CNPJ e PDV são obrigatórios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { identificacao, rede, nsu, finalizacao } = params;

      const fields: Record<string, string> = {
        '000-000': 'NCN',
        '001-000': identificacao || '1',
      };

      if (rede) fields['010-000'] = rede;
      if (nsu) fields['012-000'] = nsu;
      fields['027-000'] = finalizacao || '';
      fields['999-999'] = '0';

      const conteudo = buildConteudo(fields);
      console.log('[TEF-WS] NCN CONTEUDO:', conteudo);

      const response = await fetch(`${TEF_API_URL}/SetVendaTef`, {
        method: 'POST',
        headers: {
          'CNPJ': cnpj,
          'PDV': pdv,
          'TOKEN': token,
          'CONTEUDO': conteudo,
        },
      });

      const text = await response.text();
      console.log('[TEF-WS] NCN response:', text);

      return new Response(
        JSON.stringify({ success: response.ok && !text.startsWith('[ERRO]'), message: text }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CNC - Cancel a previous transaction
    if (action === 'cnc') {
      if (!cnpj || !pdv) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'CNPJ e PDV são obrigatórios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { identificacao, rede, nsu, dataTransacao, horaTransacao, amount } = params;

      const fields: Record<string, string> = {
        '000-000': 'CNC',
        '001-000': identificacao || String(Date.now()),
        '003-000': String(Math.round(amount * 100)),
        '010-000': rede || '',
        '012-000': nsu || '',
        '022-000': dataTransacao || '',
        '023-000': horaTransacao || '',
        '800-006': '1',
        '999-999': '0',
      };

      const conteudo = buildConteudo(fields);
      console.log('[TEF-WS] CNC CONTEUDO:', conteudo);

      const response = await fetch(`${TEF_API_URL}/SetVendaTef`, {
        method: 'POST',
        headers: {
          'CNPJ': cnpj,
          'PDV': pdv,
          'TOKEN': token,
          'CONTEUDO': conteudo,
        },
      });

      const text = await response.text();
      console.log('[TEF-WS] CNC response:', text);

      if (text.startsWith('[ERRO]')) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return the identificacao used so client can send CNF after CNC completes
      return new Response(
        JSON.stringify({ success: true, hash: text.trim(), identificacao: fields['001-000'] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ADM - Administrative operations
    if (action === 'adm') {
      if (!cnpj || !pdv) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'CNPJ e PDV são obrigatórios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const { identificacao } = params;

      // ============================================================
      // ADM (Menu administrativo)
      // O CNF subsequente DEVE reusar este mesmo 001-000 (identificacao).
      // Retornamos o ID efetivamente enviado para o cliente reusar.
      // ============================================================
      const admIdent = String(identificacao || '1');

      const conteudo = buildConteudo({
        '000-000': 'ADM',
        '001-000': admIdent,
        '999-999': '0',
      });

      const response = await fetch(`${TEF_API_URL}/SetVendaTef`, {
        method: 'POST',
        headers: {
          'CNPJ': cnpj,
          'PDV': pdv,
          'TOKEN': token,
          'CONTEUDO': conteudo,
        },
      });

      const text = await response.text();
      console.log('[TEF-WS] ADM response:', text);

      if (text.startsWith('[ERRO]')) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, hash: text.trim(), identificacao: admIdent }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // RPR - Reimpressão do último comprovante (CRT com 800-001 = 8)
    if (action === 'rpr') {
      if (!cnpj || !pdv) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: 'CNPJ e PDV são obrigatórios' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
      }

      const ident = params.identificacao || String(Date.now());
      // ============================================================
      // RPR (Reimpressão do último comprovante)
      // Multiplus rejeitou 800-001 = 8 (valores válidos: 0..7).
      // Para a Lancheria da i9 (homologação v1.2): enviar como ADM
      // sem o campo 800-001 — o gerenciador padrão da Multiplus
      // tratará a reimpressão pelo menu administrativo do PinPad.
      // Demais lojas seguem o fluxo legado até a homologação confirmar.
      // ============================================================
      const useAdmForRpr = isI9(params.companyId);
      const fields: Record<string, string> = useAdmForRpr
        ? {
            '000-000': 'ADM',
            '001-000': ident,
            '999-999': '0',
          }
        : {
            '000-000': 'CRT',
            '001-000': ident,
            '003-000': '0',
            '800-001': '8', // legacy — não validado pela Multiplus
            '800-006': '1',
            '999-999': '0',
          };

      const conteudo = buildConteudo(fields);
      console.log(`[TEF-WS] RPR CONTEUDO (mode=${useAdmForRpr ? 'ADM' : 'CRT-legacy'}):`, conteudo);

      const response = await fetch(`${TEF_API_URL}/SetVendaTef`, {
        method: 'POST',
        headers: {
          'CNPJ': cnpj,
          'PDV': pdv,
          'TOKEN': token,
          'CONTEUDO': conteudo,
        },
      });

      const text = await response.text();
      console.log('[TEF-WS] RPR response:', text);

      if (!response.ok || text.startsWith('[ERRO]')) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: text || `Erro RPR: ${response.status}` }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, hash: text.trim(), identificacao: ident }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, errorMessage: 'Ação inválida' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );

  } catch (error) {
    console.error('[TEF-WS] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ success: false, errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});
