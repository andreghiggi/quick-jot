import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    // Validate caller is super_admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid auth' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'super_admin')
      .maybeSingle();
    if (!roleRow) {
      return new Response(JSON.stringify({ error: 'Forbidden: super_admin only' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { reseller_id, email, password, full_name } = body;
    if (!reseller_id || !email || !password) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (password.length < 6) {
      return new Response(JSON.stringify({ error: 'Senha deve ter pelo menos 6 caracteres' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create auth user (auto-confirmed so they can login immediately)
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });
    if (createErr || !created.user) {
      return new Response(JSON.stringify({ error: createErr?.message || 'Failed to create user' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const newUserId = created.user.id;

    // Link reseller record to auth user
    const { error: linkErr } = await admin
      .from('resellers')
      .update({ user_id: newUserId })
      .eq('id', reseller_id);
    if (linkErr) {
      return new Response(JSON.stringify({ error: linkErr.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Assign 'reseller' role
    const { error: roleErr } = await admin
      .from('user_roles')
      .upsert({ user_id: newUserId, role: 'reseller' }, { onConflict: 'user_id,role' });
    if (roleErr) {
      console.error('Role assign error:', roleErr);
    }

    // Ensure profile exists (handle_new_user trigger should already create it,
    // but createUser by admin may bypass — upsert defensively)
    await admin.from('profiles').upsert({
      id: newUserId,
      email,
      full_name: full_name || email,
    }, { onConflict: 'id' });

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    console.error('create-reseller-user error:', err);
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
