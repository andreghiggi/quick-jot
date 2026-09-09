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
  const uid = "a83fe7d2-f36b-49f5-9535-9431687ce1da";
  const cid = "32b71649-461d-4cb6-b26c-12390b090feb";

  const hasRole = await sql`select public.has_role(${uid}::uuid, 'company_admin'::app_role) as ok`;
  const belongs = await sql`select public.user_belongs_to_company(${uid}::uuid, ${cid}::uuid) as ok`;

  const policies = await sql`
    select tablename, policyname, cmd, qual
    from pg_policies
    where schemaname='public' and tablename='company_modules'
  `;

  console.log("has_role company_admin:", hasRole[0].ok);
  console.log("user_belongs_to_company:", belongs[0].ok);
  console.log("\ncompany_modules policies:");
  for (const p of policies) console.log(` - ${p.policyname} (${p.cmd}): ${(p.qual||'').slice(0,120)}`);

  const mod = await sql`
    select * from public.company_modules
    where company_id = ${cid} and module_name = 'pdv_v2'
  `;
  console.log("\npdv_v2 module:", mod[0]);
} finally {
  await sql.end();
}
