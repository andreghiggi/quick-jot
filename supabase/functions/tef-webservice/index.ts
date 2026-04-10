import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TEF_API_URL = 'https://api.multipluscard.com.br/api/Servicos';

// Separator character used in CONTEUDO header
const SEP = '¬';

// Build CONTEUDO string from key-value pairs
function buildConteudo(fields: Record<string, string>): string {
  return Object.entries(fields)
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
      // Remove surrounding quotes if present
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

      // Check for error responses
      if (text.startsWith('[ERRO]')) {
        return new Response(
          JSON.stringify({ success: false, errorMessage: text }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // ATV returns hash if successful
      const hash = text.trim();

      // Now poll GetVendasTef to get ATV result
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

      // Build CONTEUDO fields
      const fields: Record<string, string> = {
        '000-000': 'CRT',
        '001-000': identificacao || String(Date.now()),
        '003-000': String(Math.round(amount * 100)), // Value in cents without decimal separator
        '999-999': '0',
      };

      if (documentoFiscal) {
        fields['002-000'] = documentoFiscal;
      }

      // Optional: payment type specification (direct integration)
      // 800-001: 0=Credit, 1=Debit, 5=Pix
      if (paymentType !== undefined && paymentType !== null) {
        fields['800-001'] = String(paymentType);
      }

      // 800-002: 0=À vista, 1=Parcelado
      if (installments && installments > 1) {
        fields['800-002'] = '1'; // Parcelado
        fields['800-003'] = '1'; // Parcelado Loja
        fields['800-004'] = String(installments);
      } else if (paymentType !== undefined) {
        fields['800-002'] = '0'; // À vista
      }

      // 800-005: CNPJ da empresa
      if (cnpj) {
        fields['800-005'] = cnpj;
      }

      // 800-006: Equipment type (1=PINPAD, 2=CIELO LIO, 3=PINPDV)
      fields['800-006'] = String(equipment || 1); // Default to PINPAD

      const conteudo = buildConteudo(fields);
      console.log('[TEF-WS] CRT CONTEUDO:', conteudo);

      // Optional: callback URL
      const callbackUrl = params.callbackUrl;

      const headers: Record<string, string> = {
        'CNPJ': cnpj,
        'PDV': pdv,
        'TOKEN': token,
        'CONTEUDO': conteudo,
      };

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
      return new Response(
        JSON.stringify({ success: true, hash }),
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

      const response = await fetch(`${TEF_API_URL}/GetVendasTef`, {
        method: 'GET',
        headers: {
          'HASH': hash,
          'TOKEN': token,
        },
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

      const result: Record<string, unknown> = {
        success: isApproved,
        status: isApproved ? 'approved' : 'declined',
        raw: parsed,
        // Transaction details
        nsu: parsed['012-000'] || parsed['012-001'] || '',
        authorizationCode: parsed['013-000'] || parsed['013-001'] || '',
        nsuHost: parsed['170-000'] || '',
        acquirer: parsed['010-000'] || parsed['010-010'] || '',
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

      const fields: Record<string, string> = {
        '000-000': 'CNF',
        '001-000': identificacao || '1',
        '027-000': finalizacao || '',
        '999-999': '0',
      };

      if (rede) fields['010-000'] = rede;
      if (nsu) fields['012-000'] = nsu;

      const conteudo = buildConteudo(fields);
      console.log('[TEF-WS] CNF CONTEUDO:', conteudo);

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
        '027-000': finalizacao || '',
        '999-999': '0',
      };

      if (rede) fields['010-000'] = rede;
      if (nsu) fields['012-000'] = nsu;

      const conteudo = buildConteudo(fields);

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
        '010-000': rede,
        '012-000': nsu,
        '022-000': dataTransacao,
        '023-000': horaTransacao,
        '999-999': '0',
      };

      const conteudo = buildConteudo(fields);

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

      return new Response(
        JSON.stringify({ success: true, hash: text.trim() }),
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

      const conteudo = buildConteudo({
        '000-000': 'ADM',
        '001-000': identificacao || '1',
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
        JSON.stringify({ success: true, hash: text.trim() }),
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
