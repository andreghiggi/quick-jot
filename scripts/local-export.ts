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
    const profilesWithoutAuthCount = await sql`SELECT count(*) FROM public.profiles p WHERE NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.id)`.catch(() => [{count: 0}]);
    bundle.validation.profiles_without_auth_user = Number(profilesWithoutAuthCount[0].count);

    console.error("Generating bundle JSON...");
    console.log(JSON.stringify(bundle));
    await sql.end();
  } catch (err) {
    console.error(err);
    Deno.exit(1);
  }
}

run();
