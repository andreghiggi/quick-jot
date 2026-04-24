import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Verify the calling user is authenticated and is a company admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Authorization header required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify permissions
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is company_admin or super_admin
    const { data: roles } = await supabaseUser.from("user_roles").select("role").eq("user_id", user.id);
    const userRoles = roles?.map((r) => r.role) || [];
    
    if (!userRoles.includes("company_admin") && !userRoles.includes("super_admin")) {
      return new Response(
        JSON.stringify({ error: "Permission denied. Only company admins can create waiters." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's company
    const { data: companyUser } = await supabaseUser.from("company_users").select("company_id").eq("user_id", user.id).single();
    if (!companyUser) {
      return new Response(
        JSON.stringify({ error: "User not associated with any company" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, password, name, phone } = await req.json();

    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({ error: "Email, password and name are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role to create user without affecting current session
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Create the auth user
    let { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm email
      user_metadata: { full_name: name },
    });

    let newUserId: string;

    if (createError) {
      console.error("Error creating user:", createError);
      const isEmailExists =
        (createError as any)?.code === "email_exists" ||
        /already.*registered|already been registered|email_exists/i.test(createError.message || "");

      if (!isEmailExists) {
        return new Response(
          JSON.stringify({ error: createError.message }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Email already exists — try to reuse if it's an orphan (no waiter record yet)
      const { data: existingUsers, error: listErr } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 200,
      });
      if (listErr) {
        return new Response(
          JSON.stringify({ error: "Email já cadastrado e não foi possível verificar status do usuário." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const existing = existingUsers.users.find(
        (u) => (u.email || "").toLowerCase() === email.toLowerCase()
      );
      if (!existing) {
        return new Response(
          JSON.stringify({ error: "Este email já está cadastrado no sistema." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if it's already a waiter somewhere
      const { data: existingWaiter } = await supabaseAdmin
        .from("waiters")
        .select("id, company_id")
        .eq("user_id", existing.id)
        .maybeSingle();

      if (existingWaiter) {
        return new Response(
          JSON.stringify({ error: "Este email já está cadastrado como garçom em outra loja." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Check if linked to any company
      const { data: existingCompanyLink } = await supabaseAdmin
        .from("company_users")
        .select("company_id")
        .eq("user_id", existing.id)
        .maybeSingle();

      if (existingCompanyLink && existingCompanyLink.company_id !== companyUser.company_id) {
        return new Response(
          JSON.stringify({ error: "Este email já está vinculado a outra empresa." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Reuse orphan user — update password to the new one
      await supabaseAdmin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        user_metadata: { full_name: name },
      });
      newUserId = existing.id;
    } else {
      newUserId = newUser!.user.id;
    }

    // Delete default company_user role and add waiter role
    await supabaseAdmin.from("user_roles").delete().eq("user_id", newUserId);
    
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: newUserId,
      role: "waiter",
    });

    if (roleError) {
      console.error("Error setting waiter role:", roleError);
      return new Response(
        JSON.stringify({ error: "Failed to set waiter role" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Add to company_users (upsert to be safe if already linked)
    await supabaseAdmin
      .from("company_users")
      .delete()
      .eq("user_id", newUserId)
      .eq("company_id", companyUser.company_id);

    const { error: companyError } = await supabaseAdmin.from("company_users").insert({
      company_id: companyUser.company_id,
      user_id: newUserId,
      is_owner: false,
    });

    if (companyError) {
      console.error("Error adding to company:", companyError);
      return new Response(
        JSON.stringify({ error: "Failed to link to company" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create waiter record
    const { error: waiterError } = await supabaseAdmin.from("waiters").insert({
      user_id: newUserId,
      company_id: companyUser.company_id,
      name,
      phone: phone || null,
      active: true,
    });

    if (waiterError) {
      console.error("Error creating waiter record:", waiterError);
      return new Response(
        JSON.stringify({ error: "Failed to create waiter record" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        waiter: { id: newUserId, email, name, phone } 
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
