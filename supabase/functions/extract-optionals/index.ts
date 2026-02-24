import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) {
    return new Response(
      JSON.stringify({ error: 'AI not configured' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const { imageUrl } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const systemPrompt = `Você é um assistente especializado em extrair adicionais/complementos de cardápios de restaurantes.
Analise a imagem e extraia todos os itens adicionais, complementos, extras, bordas, molhos, acompanhamentos, etc.

Para cada item, retorne:
- name: nome do adicional
- price: preço numérico (apenas o número, ex: 3.50). Se não houver preço visível, use 0.
- group: nome do grupo ao qual pertence (ex: "Molhos", "Bordas", "Proteínas extras", "Acompanhamentos", "Bebidas extras")

Agrupe os itens logicamente. Se a imagem mostrar grupos claros, use esses nomes.
Se não houver agrupamento visível, agrupe por tipo similar.

Retorne APENAS um JSON válido no formato:
{"groups": [{"name": "Nome do Grupo", "items": [{"name": "...", "price": 0.00}]}]}

Não invente itens que não estão na imagem.`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extraia todos os adicionais/complementos desta imagem de cardápio:' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ]
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em instantes.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: 'Créditos insuficientes para IA.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const errText = await response.text();
      console.error('AI API error:', errText);
      throw new Error('Erro ao processar com IA');
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';

    let groups: any[] = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*"groups"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        groups = parsed.groups || [];
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', content);
      throw new Error('Não foi possível interpretar os adicionais');
    }

    return new Response(
      JSON.stringify({ groups }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Extract optionals error:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
