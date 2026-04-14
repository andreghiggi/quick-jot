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
    const { imageUrl, fileType, existingCategories, existingSubcategories } = await req.json();

    if (!imageUrl) {
      return new Response(
        JSON.stringify({ error: 'imageUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build category/subcategory context for smart matching
    let categoryContext = '';
    if (existingCategories && existingCategories.length > 0) {
      categoryContext = `\n\nCATEGORIAS EXISTENTES DA EMPRESA (use estas sempre que possível, fazendo match semântico/fuzzy):
${existingCategories.map((c: any) => {
  const subs = (existingSubcategories || []).filter((s: any) => s.categoryId === c.id);
  const subsText = subs.length > 0 ? ` → Subcategorias: [${subs.map((s: any) => `"${s.name}" (id: ${s.id})`).join(', ')}]` : '';
  return `- "${c.name}" (id: ${c.id})${subsText}`;
}).join('\n')}

REGRAS DE MATCHING:
- Se o produto é um refrigerante e existe uma categoria "Bebidas" com subcategoria "Refrigerantes", use category_id da "Bebidas" e subcategory_id de "Refrigerantes"
- Se o produto é um lanche e existe "Lanches", use essa categoria
- Faça matching semântico: "X-Burguer" → "Lanches", "Coca-Cola" → "Bebidas"/"Refrigerantes"
- Se não encontrar match, sugira um nome de categoria nova no campo "category" (texto) e deixe category_id e subcategory_id como null
- NUNCA deixe a categoria vazia`;
    }

    const systemPrompt = `Você é um assistente especializado em extrair informações de cardápios de restaurantes.
Analise a imagem do cardápio e extraia todos os produtos visíveis.
Para cada produto, retorne:
- name: nome do produto
- price: preço numérico (apenas o número, ex: 25.90)
- category: nome da categoria (texto)
- category_id: id da categoria existente se houver match (ou null)
- subcategory_id: id da subcategoria existente se houver match (ou null)
- description: descrição breve se visível
- is_new_category: true se a categoria é nova (não existe na lista), false se é existente
${categoryContext}

Retorne APENAS um JSON válido no formato:
{"products": [{"name": "...", "price": 0.00, "category": "...", "category_id": "..." ou null, "subcategory_id": "..." ou null, "description": "...", "is_new_category": true/false}]}

Se não conseguir identificar o preço, use 0.
Se não conseguir identificar a categoria, crie uma nova com nome apropriado baseado no tipo de produto.
Não invente produtos que não estão na imagem.`;

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
              { type: 'text', text: 'Extraia todos os produtos deste cardápio:' },
              { type: 'image_url', image_url: { url: imageUrl } },
            ]
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('AI API error:', errText);
      throw new Error('Erro ao processar com IA');
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || '';
    
    let products = [];
    try {
      const jsonMatch = content.match(/\{[\s\S]*"products"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        products = parsed.products || [];
      }
    } catch (parseError) {
      console.error('Error parsing AI response:', content);
      throw new Error('Não foi possível interpretar o cardápio');
    }

    return new Response(
      JSON.stringify({ products }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Extract menu error:', error);
    const msg = error instanceof Error ? error.message : 'Erro desconhecido';
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
