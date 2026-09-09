import postgres from "postgres";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

function loadEnvBackup() {
  const envPath = resolve(process.cwd(), ".env.backup");
  if (!existsSync(envPath)) throw new Error(".env.backup não encontrado");
  const vars = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    vars[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
  return vars;
}

const { TARGET_DB_URL } = loadEnvBackup();
if (!TARGET_DB_URL) throw new Error("TARGET_DB_URL ausente");

const sql = postgres(TARGET_DB_URL, { max: 1, prepare: false, connect_timeout: 20 });

try {
  const users = await sql`select count(*)::int as n from auth.users`;
  const identities = await sql`select count(*)::int as n from auth.identities`;
  const companies = await sql`select count(*)::int as n from public.companies`;
  const sample = await sql`
    select id, email,
           encrypted_password is not null and length(encrypted_password) > 0 as has_pwd,
           email_confirmed_at is not null as confirmed
    from auth.users
    order by created_at desc nulls last
    limit 5
  `;

  console.log(JSON.stringify({ users: users[0].n, identities: identities[0].n, companies: companies[0].n, sample }, null, 2));
} finally {
  await sql.end({ timeout: 5 });
}
