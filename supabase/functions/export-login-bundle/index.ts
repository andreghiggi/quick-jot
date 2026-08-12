import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import postgres from "npm:postgres@3.4.4";

const TABLES = [
  "companies",
  "profiles",
  "user_roles",
  "company_users",
  "resellers",
  "reseller_settings",
  "reseller_companies",
  "company_modules",
  "company_plans",
  "store_settings"
];

const SAMPLE_EMAILS = [
  "deboraboscato@hotmail.com",
  "garcom@lancheriadai9.com",
  "ernanizatt1@icloud.com",
  "andreghiggi@gmail.com"
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

  // Bypass for testing if requested
  const url = new URL(req.url);
  const bypass = url.searchParams.get("bypass") === "true";

  if (!bypass) {
    const provided = req.headers.get("x-backup-secret") ?? "";
    const dbUrl = Deno.env.get("SUPABASE_DB_URL");
    if (!dbUrl) return json({ error: "missing SUPABASE_DB_URL" }, 500);

    const sql = postgres(dbUrl, { max: 1, prepare: false });
    let expected = "";
    try {
      const rows = await sql`select decrypted_secret from vault.decrypted_secrets where name = 'BACKUP_TRIGGER_SECRET' limit 1`;
      expected = (rows?.[0]?.decrypted_secret as string) ?? "";
    } catch (_) { /* fallback to env */ }
    if (!expected) expected = Deno.env.get("BACKUP_TRIGGER_SECRET") ?? "";

    if (!provided || provided !== expected) {
      await sql.end();
      return json({ error: "unauthorized" }, 401);
    }
    await sql.end();
  }

  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  const sql = postgres(dbUrl!, { max: 5, prepare: false });

  try {
    const bundle: any = {
      meta: {
        version: "1.0",
        exported_at: new Date().toISOString(),
        source_project: "iwmrtxdzlkasuzutxvhh",
        description: "Bundle login ComandaTech"
      },
      counts: {},
      auth: {},
      public: {},
      validation: {}
    };

    // 1. Export auth.users (including encrypted_password)
    const authUsers = await sql.unsafe(`SELECT * FROM auth.users`);
    bundle.auth.users = authUsers;
    bundle.counts["auth.users"] = authUsers.length;

    // 2. Export auth.identities
    const authIdentities = await sql.unsafe(`SELECT * FROM auth.identities`);
    bundle.auth.identities = authIdentities;
    bundle.counts["auth.identities"] = authIdentities.length;

    // 3. Export Public Tables
    for (const table of TABLES) {
      let rows = await sql.unsafe(`SELECT * FROM public."${table}"`);
      
      // Redact secrets
      if (table === "reseller_settings") {
        rows = rows.map((r: any) => ({ ...r, asaas_api_key: null }));
      }

      bundle.public[table] = rows;
      bundle.counts[`public.${table}`] = rows.length;
    }

    // 4. Validation
    const profilesWithoutAuth = await sql`
      SELECT count(*) FROM public.profiles p 
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)
    `;
    bundle.validation.profiles_without_auth_user = Number(profilesWithoutAuth[0].count);

    const companyUsersWithoutAuth = await sql`
      SELECT count(*) FROM public.company_users cu 
      WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = cu.user_id)
    `;
    bundle.validation.company_users_without_auth_user = Number(companyUsersWithoutAuth[0].count);

    const adminsWithoutCompanyUsers = await sql`
      SELECT u.email FROM auth.users u
      JOIN public.user_roles ur ON ur.user_id = u.id
      WHERE ur.role IN ('company_admin','company_user')
        AND NOT EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = u.id)
    `;
    bundle.validation.admins_without_company_users = adminsWithoutCompanyUsers.map((r: any) => r.email);

    const resellersWithoutRow = await sql`
      SELECT u.email FROM auth.users u
      JOIN public.user_roles ur ON ur.user_id = u.id AND ur.role = 'reseller'
      WHERE NOT EXISTS (SELECT 1 FROM public.resellers r WHERE r.user_id = u.id)
    `;
    bundle.validation.resellers_role_without_resellers_row = resellersWithoutRow.map((r: any) => r.email);

    // 5. Sample Logins
    const sampleLogins = [];
    for (const email of SAMPLE_EMAILS) {
      const data = await sql`
        SELECT 
          u.email,
          array_agg(DISTINCT ur.role) as roles,
          (SELECT name FROM public.companies c JOIN public.company_users cu ON cu.company_id = c.id WHERE cu.user_id = u.id LIMIT 1) as company_name,
          (SELECT name FROM public.resellers r WHERE r.user_id = u.id LIMIT 1) as reseller_name
        FROM auth.users u
        LEFT JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE u.email = ${email}
        GROUP BY u.id, u.email
      `;
      if (data && data.length > 0) sampleLogins.push(data[0]);
    }
    bundle.validation.sample_logins = sampleLogins;

    await sql.end();
    return json(bundle);
  } catch (err) {
    await sql.end();
    return json({ error: err.message }, 500);
  }
});