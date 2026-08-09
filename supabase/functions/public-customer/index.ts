import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const lookupSchema = z.object({
  action: z.literal('lookup'),
  company_id: z.string().uuid(),
  phone: z.string().regex(/^\d{10,13}$/),
});

const upsertSchema = z.object({
  action: z.literal('upsert'),
  company_id: z.string().uuid(),
  phone: z.string().regex(/^\d{10,13}$/),
  name: z.string().trim().min(2).max(100),
  cpf: z.string().regex(/^\d{11}$/).nullish(),
  birth_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullish(),
  address: z.string().trim().max(500).nullish(),
  city: z.string().trim().max(100).nullish(),
  state: z.string().trim().max(2).nullish(),
});

const bodySchema = z.discriminatedUnion('action', [lookupSchema, upsertSchema]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const parsed = bodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: 'Dados inválidos', details: parsed.error.flatten() }, 400);
    }
    const input = parsed.data;

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Only serve companies that exist (avoids probing arbitrary uuids)
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('id', input.company_id)
      .maybeSingle();
    if (!company) return json({ error: 'Empresa não encontrada' }, 404);

    if (input.action === 'lookup') {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, cpf, birth_date, address, city, state')
        .eq('company_id', input.company_id)
        .eq('phone', input.phone)
        .maybeSingle();
      if (error) throw error;
      return json({ customer: data ?? null });
    }

    const { data, error } = await supabase
      .from('customers')
      .upsert({
        company_id: input.company_id,
        phone: input.phone,
        name: input.name,
        cpf: input.cpf ?? null,
        birth_date: input.birth_date ?? null,
        address: input.address ?? null,
        city: input.city ?? null,
        state: input.state ?? null,
      }, { onConflict: 'company_id,phone', ignoreDuplicates: false })
      .select('id')
      .maybeSingle();
    if (error) throw error;

    return json({ customer_id: data?.id ?? null });
  } catch (err) {
    console.error('public-customer error:', err);
    return json({ error: 'Erro ao processar solicitação' }, 500);
  }
});
