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
  const grants = await sql`
    select grantee, table_name, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('authenticated', 'anon')
      and table_name in ('profiles', 'user_roles', 'company_users', 'companies', 'company_modules')
    order by table_name, grantee, privilege_type
  `;
  console.log("=== GRANTS ===");
  for (const g of grants) console.log(`${g.table_name} ${g.grantee}: ${g.privilege_type}`);

  const authGrants = await sql`
    select grantee, privilege_type
    from information_schema.role_table_grants
    where table_schema = 'auth' and table_name = 'users' and grantee = 'authenticated'
  `;
  console.log("\nauth.users grants authenticated:", authGrants);
} finally {
  await sql.end();
}
