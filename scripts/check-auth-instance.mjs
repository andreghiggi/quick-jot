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
const sql = postgres(TARGET_DB_URL, { max: 1, prepare: false });

try {
  const enums = await sql`
    select e.enumlabel from pg_type t
    join pg_enum e on e.enumtypid = t.oid
    where t.typname = 'app_role' order by e.enumsortorder
  `;
  console.log("app_role enum:", enums.map((e) => e.enumlabel));

  const user = await sql`
    select id, email, instance_id, aud, role from auth.users
    where email = 'deboraboscato@hotmail.com'
  `;
  console.log("\nauth user:", user[0]);

  const cu = await sql`
    select cu.* from public.company_users cu
    join auth.users u on u.id = cu.user_id
    where u.email = 'deboraboscato@hotmail.com'
  `;
  console.log("\ncompany_users:", cu[0]);

  const fn = await sql`
    select public.user_belongs_to_company(
      (select id from auth.users where email = 'deboraboscato@hotmail.com'),
      (select company_id from public.company_users cu join auth.users u on u.id=cu.user_id where u.email='deboraboscato@hotmail.com' limit 1)
    ) as belongs
  `;
  console.log("\nuser_belongs_to_company:", fn[0].belongs);

  const inst = await sql`select id from auth.instances limit 1`;
  console.log("\nauth.instances:", inst[0]?.id);
  console.log("instance match:", user[0]?.instance_id === inst[0]?.id);
} finally {
  await sql.end();
}
