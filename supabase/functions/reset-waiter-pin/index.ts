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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization header required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: roles } = await supabaseUser
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    const userRoles = roles?.map((r) => r.role) || [];
    if (!userRoles.includes("company_admin") && !userRoles.includes("super_admin")) {
      return new Response(JSON.stringify({ error: "Permission denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { waiter_id, pin } = await req.json();
    const pinDigits = (pin ?? "").toString().replace(/\D/g, "");
    if (!waiter_id || pinDigits.length !== 4) {
      return new Response(
        JSON.stringify({ error: "PIN deve ter 4 dígitos numéricos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Get waiter and confirm caller has access to its company
    const { data: waiter, error: waiterErr } = await supabaseAdmin
      .from("waiters")
      .select("id, user_id, company_id, cpf")
      .eq("id", waiter_id)
      .maybeSingle();
    if (waiterErr || !waiter) {
      return new Response(JSON.stringify({ error: "Garçom não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!waiter.cpf) {
      return new Response(
        JSON.stringify({ error: "Este garçom ainda não possui CPF cadastrado. Edite o cadastro para atualizar." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Caller must belong to same company OR be super_admin
    if (!userRoles.includes("super_admin")) {
      const { data: link } = await supabaseUser
        .from("company_users")
        .select("company_id")
        .eq("user_id", user.id)
        .eq("company_id", waiter.company_id)
        .maybeSingle();
      if (!link) {
        return new Response(JSON.stringify({ error: "Permission denied" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const newPassword = `WTR-${pinDigits}-${waiter.cpf}`;
    const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(waiter.user_id, {
      password: newPassword,
    });
    if (updErr) {
      return new Response(JSON.stringify({ error: updErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("reset-waiter-pin error", e);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});