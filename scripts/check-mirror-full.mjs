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
  const resellers = await sql`select id, name, email, user_id from public.resellers order by email`;
  const waiters = await sql`
    select u.email, exists(select 1 from public.company_users cu where cu.user_id=u.id) as has_cu
    from auth.users u join public.user_roles ur on ur.user_id=u.id
    where ur.role='waiter' order by u.email
  `;
  const tables = await sql`
    select relname, n_live_tup::bigint as rows
    from pg_stat_user_tables
    where schemaname='public'
      and relname = any(${[
        "company_users",
        "profiles",
        "user_roles",
        "companies",
        "resellers",
        "reseller_settings",
        "reseller_companies",
        "orders",
        "products",
        "categories",
        "backup_runs",
      ]})
    order by relname
  `;

  const andre = await sql`
    select u.email, r.id as reseller_id, r.user_id, ur.role
    from auth.users u
    left join public.resellers r on r.user_id = u.id or r.email = u.email
    left join public.user_roles ur on ur.user_id = u.id
    where u.email = 'andreghiggi@gmail.com'
  `;

  console.log("=== Tabelas chave (espelho) ===");
  for (const t of tables) console.log(`  ${t.relname}: ${t.rows}`);

  console.log("\n=== Resellers ===");
  for (const r of resellers) console.log(`  ${r.email} user_id=${r.user_id ? "ok" : "NULL"}`);

  console.log("\n=== Garçons (waiter) ===");
  for (const w of waiters) console.log(`  ${w.email}: ${w.has_cu ? "COM empresa" : "SEM empresa"}`);

  console.log("\n=== andreghiggi@gmail.com ===");
  console.log(JSON.stringify(andre, null, 2));
} finally {
  await sql.end();
}
