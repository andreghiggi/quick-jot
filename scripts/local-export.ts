import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

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

async function run() {
  const dbUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!dbUrl) {
    console.error("Missing SUPABASE_DB_URL");
    Deno.exit(1);
  }

  const sql = postgres(dbUrl, { max: 5, prepare: false });

  try {
    const bundle = {
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

    console.error("Exporting auth.users via helper...");
    // A única forma de pegar auth.users com service_role é via Edge Function ou se o sandbox tiver privilégios.
    // Como o sandbox não tem, vamos tentar exportar via query direto no Postgres (se o DB_URL for service_role)
    try {
       const authUsers = await sql.unsafe("SELECT * FROM auth.users");
       bundle.auth.users = authUsers;
       bundle.counts["auth.users"] = authUsers.length;
       
       const authIdentities = await sql.unsafe("SELECT * FROM auth.identities");
       bundle.auth.identities = authIdentities;
       bundle.counts["auth.identities"] = authIdentities.length;
    } catch (e) {
       console.error("Failed to export auth schema directly:", e.message);
       bundle.auth.users = [];
       bundle.auth.identities = [];
       bundle.counts["auth.users"] = 0;
    }

    console.error("Exporting public tables...");
    for (const table of TABLES) {
      let rows = await sql.unsafe(`SELECT * FROM public."${table}"`);
      if (table === "reseller_settings") {
        rows = rows.map((r) => ({ ...r, asaas_api_key: null }));
      }
      bundle.public[table] = rows;
      bundle.counts["public." + table] = rows.length;
    }

    console.error("Running validations...");
    try {
      const profilesWithoutAuthCount = await sql`SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)`;
      bundle.validation.profiles_without_auth_user = Number(profilesWithoutAuthCount[0].count);

      const adminsWithoutCompanyUsers = await sql`
        SELECT u.email FROM auth.users u
        JOIN public.user_roles ur ON ur.user_id = u.id
        WHERE ur.role IN ('company_admin','company_user')
          AND NOT EXISTS (SELECT 1 FROM public.company_users cu WHERE cu.user_id = u.id)
      `;
      bundle.validation.admins_without_company_users = adminsWithoutCompanyUsers.map((r) => r.email);
    } catch (e) {
      console.error("Validation queries failed:", e.message);
    }

    console.error("Generating bundle JSON...");
    console.log(JSON.stringify(bundle));
    await sql.end();
  } catch (err) {
    console.error(err);
    Deno.exit(1);
  }
}

run();
