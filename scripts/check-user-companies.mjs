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

const emails = [
  "andreghiggi@gmail.com",
  "deboraboscato@hotmail.com",
  "debora@lancheriai9.com",
  "garcom@lancheriadai9.com",
  "ernanizatt1@icloud.com",
];

try {
  for (const email of emails) {
    const rows = await sql`
      select
        u.id,
        u.email,
        p.full_name,
        coalesce(array_agg(distinct ur.role) filter (where ur.role is not null), '{}') as roles,
        coalesce(array_agg(distinct c.name) filter (where c.name is not null), '{}') as companies
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join public.user_roles ur on ur.user_id = u.id
      left join public.company_users cu on cu.user_id = u.id
      left join public.companies c on c.id = cu.company_id
      where u.email = ${email}
      group by u.id, u.email, p.full_name
    `;
    console.log(JSON.stringify(rows[0] ?? { email, missing: true }, null, 2));
  }

  const multiCompany = await sql`
    select user_id, count(*)::int as n
    from public.company_users
    group by user_id
    having count(*) > 1
  `;
  console.log("\nUsuarios com multiplas empresas:", multiCompany.length);

  const resellers = await sql`
    select r.email, r.user_id, u.email as auth_email
    from public.resellers r
    left join auth.users u on u.id = r.user_id
    limit 10
  `;
  console.log("\nResellers (amostra):");
  for (const r of resellers) console.log(" -", r.email, "user_id=", r.user_id ? "ok" : "NULL");

  const brokenCu = await sql`
    select count(*)::int as n from public.company_users cu
    left join auth.users u on u.id = cu.user_id
    where u.id is null
  `;
  const adminsNoCompany = await sql`
    select u.email, ur.role
    from auth.users u
    join public.user_roles ur on ur.user_id = u.id
    where ur.role in ('company_admin', 'company_user')
      and not exists (select 1 from public.company_users cu where cu.user_id = u.id)
    order by u.email
  `;
  console.log("\ncompany_users apontando para auth inexistente:", brokenCu[0].n);
  console.log("company_admin/user SEM company_users:", adminsNoCompany.length);
  for (const r of adminsNoCompany.slice(0, 15)) console.log(" -", r.email, r.role);
} finally {
  await sql.end({ timeout: 5 });
}
