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

const email = process.argv[2] || "marcelomonfrini489@gmail.com";
const { TARGET_DB_URL } = loadEnv(".env.backup");
const sql = postgres(TARGET_DB_URL, { max: 1, prepare: false, connect_timeout: 20 });

try {
  const user = await sql`
    select id, email, encrypted_password is not null as has_pwd, email_confirmed_at is not null as confirmed
    from auth.users where email = ${email}
  `;
  console.log("=== auth.users ===", user[0] || "NAO ENCONTRADO");

  if (!user[0]) process.exit(0);

  const uid = user[0].id;

  const profile = await sql`select * from public.profiles where id = ${uid}`;
  console.log("\n=== profiles ===", profile[0] || "NAO ENCONTRADO");

  const roles = await sql`select role from public.user_roles where user_id = ${uid}`;
  console.log("\n=== user_roles ===", roles.map((r) => r.role));

  const cu = await sql`
    select cu.*, c.name, c.slug, c.active
    from public.company_users cu
    left join public.companies c on c.id = cu.company_id
    where cu.user_id = ${uid}
  `;
  console.log("\n=== company_users ===", cu.length ? cu : "NENHUM VINCULO");

  const bon = await sql`
    select id, name, slug, active from public.companies
    where lower(name) like '%bon%appetit%' or lower(slug) like '%bon%'
  `;
  console.log("\n=== empresas Bon Appetit ===", bon);

  const bonUsers = await sql`
    select u.email, ur.role, c.name
    from public.company_users cu
    join auth.users u on u.id = cu.user_id
    join public.companies c on c.id = cu.company_id
    left join public.user_roles ur on ur.user_id = u.id
    where lower(c.name) like '%bon%appetit%'
  `;
  console.log("\n=== usuarios Bon Appetit no espelho ===");
  for (const r of bonUsers) console.log(" -", r.email, r.role, "→", r.name);

  const modules = await sql`
    select cm.module_name, cm.enabled
    from public.company_modules cm
    join public.companies c on c.id = cm.company_id
    where lower(c.name) like '%bon%appetit%'
    order by cm.module_name
  `;
  console.log("\n=== modulos Bon Appetit ===", modules);
} finally {
  await sql.end();
}
