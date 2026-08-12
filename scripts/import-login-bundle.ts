import postgres from "https://deno.land/x/postgresjs@v3.4.4/mod.js";

async function run() {
  const bundlePath = Deno.args[0];
  if (!bundlePath) {
    console.error("Usage: deno run --allow-read --allow-env --allow-net scripts/import-login-bundle.ts <path-to-bundle.json>");
    Deno.exit(1);
  }

  const sourceUrl = Deno.env.get("SUPABASE_DB_URL");
  if (!sourceUrl) {
    console.error("Missing SUPABASE_DB_URL (Origin)");
    Deno.exit(1);
  }

  // Pegar URL de destino do Vault ou Env
  const sqlSrc = postgres(sourceUrl, { max: 1, prepare: false });
  let targetUrl = "";
  try {
    const rows = await sqlSrc`select decrypted_secret from vault.decrypted_secrets where name = 'BACKUP_TARGET_DB_URL_VAULT' limit 1`;
    targetUrl = (rows?.[0]?.decrypted_secret as string) ?? "";
  } catch (_) {}
  if (!targetUrl) targetUrl = Deno.env.get("BACKUP_TARGET_DB_URL") ?? "";
  await sqlSrc.end();

  if (!targetUrl) {
    console.error("Missing Target DB URL");
    Deno.exit(1);
  }

  const bundle = JSON.parse(await Deno.readTextFile(bundlePath));
  const sqlDest = postgres(targetUrl, { max: 10, prepare: false });

  try {
    console.log("Starting import into destination...");
    await sqlDest`SET session_replication_role = 'replica'`;

    // 1. Auth Users
    console.log(`Importing auth.users (${bundle.auth.users.length})...`);
    await sqlDest`DELETE FROM auth.users`;
    for (const user of bundle.auth.users) {
      await sqlDest.unsafe(`INSERT INTO auth.users (${Object.keys(user).map(k => `"${k}"`).join(',')}) VALUES (${Object.values(user).map((_, i) => `$${i + 1}`).join(',')})`, Object.values(user));
    }

    // 2. Auth Identities
    console.log(`Importing auth.identities (${bundle.auth.identities.length})...`);
    await sqlDest`DELETE FROM auth.identities`;
    for (const iden of bundle.auth.identities) {
      // Fix identity_data as jsonb
      if (iden.identity_data && typeof iden.identity_data === 'object') {
        iden.identity_data = JSON.stringify(iden.identity_data);
      }
      const keys = Object.keys(iden).map(k => `"${k}"`);
      const values = Object.values(iden);
      await sqlDest.unsafe(`INSERT INTO auth.identities (${keys.join(',')}) VALUES (${values.map((_, i) => `$${i+1}`).join(',')})`, values);
    }

    // 3. Public Tables
    const publicTables = [
      "companies", "profiles", "user_roles", "company_users",
      "resellers", "reseller_settings", "reseller_companies",
      "company_modules", "company_plans", "store_settings"
    ];

    for (const table of publicTables) {
      const rows = bundle.public[table];
      console.log(`Importing public.${table} (${rows.length})...`);
      await sqlDest.unsafe(`DELETE FROM public."${table}"`);
      if (rows.length > 0) {
        for (const row of rows) {
          const keys = Object.keys(row).map(k => `"${k}"`);
          const values = Object.values(row);
          await sqlDest.unsafe(`INSERT INTO public."${table}" (${keys.join(',')}) VALUES (${values.map((_, i) => `$${i+1}`).join(',')})`, values);
        }
      }
    }

    console.log("Import completed successfully.");
    await sqlDest.end();
  } catch (err) {
    console.error("Import error:", err.message);
    await sqlDest.end();
    Deno.exit(1);
  }
}

run();
