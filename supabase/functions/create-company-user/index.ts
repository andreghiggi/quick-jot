import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { company_id, email, password, full_name } = body;
    if (!company_id || !email || !password) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Senha deve ter pelo menos 6 caracteres' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Authorize: super_admin OR the reseller that owns the company
    const { data: superRow } = await admin
      .from('user_roles').select('role')
      .eq('user_id', user.id).eq('role', 'super_admin').maybeSingle();
    const isSuper = !!superRow;

    if (!isSuper) {
      const { data: resRow } = await admin
        .from('resellers').select('id').eq('user_id', user.id).maybeSingle();
      if (!resRow) {
        return new Response(JSON.stringify({ error: 'Forbidden' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { data: comp } = await admin
        .from('companies').select('reseller_id').eq('id', company_id).maybeSingle();
      if (!comp || comp.reseller_id !== resRow.id) {
        return new Response(JSON.stringify({ error: 'Forbidden: not owner of this company' }), {
          status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Create or update auth user
    let newUserId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });

    if (createErr || !created?.user) {
      const msg = (createErr?.message || '').toLowerCase();
      const alreadyExists = msg.includes('already') || msg.includes('registered') || msg.includes('exists');
      if (!alreadyExists) {
        return new Response(JSON.stringify({ error: createErr?.message || 'Failed to create user' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      let existingId: string | null = null;
      for (let page = 1; page <= 20 && !existingId; page++) {
        const { data: list } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        const match = list?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
        if (match) existingId = match.id;
        if (!list || list.users.length < 200) break;
      }
      if (!existingId) {
        return new Response(JSON.stringify({ error: 'E-mail já registrado, mas usuário não encontrado' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const { error: updErr } = await admin.auth.admin.updateUserById(existingId, { password });
      if (updErr) {
        return new Response(JSON.stringify({ error: `Falha ao atualizar senha: ${updErr.message}` }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      newUserId = existingId;
    } else {
      newUserId = created.user.id;
    }

    // Ensure profile
    await admin.from('profiles').upsert({
      id: newUserId, email, full_name: full_name || email,
    }, { onConflict: 'id' });

    // Link company_users (owner)
    const { error: linkErr } = await admin
      .from('company_users')
      .upsert({ company_id, user_id: newUserId, is_owner: true }, { onConflict: 'company_id,user_id' });
    if (linkErr) {
      return new Response(JSON.stringify({ error: `Falha ao vincular empresa: ${linkErr.message}` }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Assign company_admin role
    const { error: roleErr } = await admin
      .from('user_roles')
      .upsert({ user_id: newUserId, role: 'company_admin' }, { onConflict: 'user_id,role' });
    if (roleErr) console.error('Role assign error:', roleErr);

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('create-company-user error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});