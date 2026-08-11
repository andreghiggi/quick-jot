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
    
    const admin = createClient(supabaseUrl, serviceRoleKey);
    
    // We are looking for 'amore mio' to fix the login
    const email = 'ernanizatt1@icloud.com';
    const password = '123456'; // From companies.initial_password
    const company_id = 'f5f9eec3-67bc-497a-88a6-ce41d3b15df8';
    
    console.log(`Fixing user ${email} for company ${company_id}`);

    // Create auth user
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: 'Amore Mio' },
    });

    if (createErr) {
      console.log('Create error (might already exist in auth):', createErr.message);
      // If user exists, we need to find the ID and update password
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const match = list?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
      
      if (match) {
        console.log('User found in auth, updating password...');
        await admin.auth.admin.updateUserById(match.id, { password });
        
        // Link and Role
        await admin.from('profiles').upsert({ id: match.id, email, full_name: 'Amore Mio' });
        await admin.from('company_users').upsert({ company_id, user_id: match.id, is_owner: true });
        await admin.from('user_roles').upsert({ user_id: match.id, role: 'company_admin' });
        
        return new Response(JSON.stringify({ success: true, message: 'Updated existing user' }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
      
      return new Response(JSON.stringify({ error: createErr.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const newUserId = created.user.id;
    console.log('User created:', newUserId);

    // Profile, Link and Role
    await admin.from('profiles').upsert({ id: newUserId, email, full_name: 'Amore Mio' });
    await admin.from('company_users').upsert({ company_id, user_id: newUserId, is_owner: true });
    await admin.from('user_roles').upsert({ user_id: newUserId, role: 'company_admin' });

    return new Response(JSON.stringify({ success: true, user_id: newUserId }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
