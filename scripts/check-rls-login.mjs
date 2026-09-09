import postgres from "postgres";
import fs from "fs";

function loadEnv(path) {
  const vars = {};
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return vars;
}

const { TARGET_DB_URL } = loadEnv(".env.backup");
const sql = postgres(TARGET_DB_URL, { max: 1, prepare: false, connect_timeout: 20 });

try {
  const policies = await sql`
    select schemaname, tablename, policyname, cmd, roles, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename in ('profiles', 'user_roles', 'company_users', 'companies')
    order by tablename, policyname
  `;
  console.log("=== RLS policies ===");
  for (const p of policies) {
    console.log(`\n[${p.tablename}] ${p.policyname} (${p.cmd})`);
    console.log("  qual:", (p.qual || "").slice(0, 200));
  }

  const rls = await sql`
    select relname, relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and relname in ('profiles', 'user_roles', 'company_users', 'companies')
  `;
  console.log("\n=== RLS enabled ===");
  for (const r of rls) console.log(r.relname, r.relrowsecurity);

  const sample = await sql`
    select u.email, cu.company_id, c.name
    from auth.users u
    join public.company_users cu on cu.user_id = u.id
    join public.companies c on c.id = cu.company_id
    where u.email = 'deboraboscato@hotmail.com'
  `;
  console.log("\n=== Sample DB row (service) ===", sample);

  const profCols = await sql`
    select column_name from information_schema.columns
    where table_schema='public' and table_name='profiles'
    order by ordinal_position
  `;
  console.log("\nprofiles columns:", profCols.map((c) => c.column_name).join(", "));
} finally {
  await sql.end();
}
