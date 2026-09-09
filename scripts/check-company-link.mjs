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
  const counts = await sql`
    select
      (select count(*)::int from auth.users) as auth_users,
      (select count(*)::int from public.profiles) as profiles,
      (select count(*)::int from public.user_roles) as user_roles,
      (select count(*)::int from public.company_users) as company_users,
      (select count(*)::int from public.companies) as companies
  `;
  console.log("Contagens:", counts[0]);

  const orphanProfiles = await sql`
    select count(*)::int as n
    from public.profiles p
    left join auth.users u on u.id = p.id
    where u.id is null
  `;
  console.log("profiles sem auth.users:", orphanProfiles[0].n);

  const usersWithoutCompany = await sql`
    select u.email, u.id
    from auth.users u
    left join public.company_users cu on cu.user_id = u.id
    where cu.user_id is null
      and u.email not like '%@waiter.comandatech.app'
    limit 10
  `;
  console.log("\nUsuarios normais SEM company_users (amostra):");
  for (const r of usersWithoutCompany) console.log(" -", r.email);

  const usersWithCompany = await sql`
    select u.email, c.name as company
    from auth.users u
    join public.company_users cu on cu.user_id = u.id
    join public.companies c on c.id = cu.company_id
    where u.email not like '%@waiter.comandatech.app'
    limit 10
  `;
  console.log("\nUsuarios normais COM empresa (amostra):");
  for (const r of usersWithCompany) console.log(" -", r.email, "→", r.company);

  const rolesSample = await sql`
    select u.email, array_agg(ur.role) as roles
    from auth.users u
    join public.user_roles ur on ur.user_id = u.id
    where u.email not like '%@waiter.comandatech.app'
    group by u.email
    limit 5
  `;
  console.log("\nRoles (amostra):");
  for (const r of rolesSample) console.log(" -", r.email, r.roles);
} finally {
  await sql.end({ timeout: 5 });
}
