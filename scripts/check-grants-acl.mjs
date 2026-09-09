import postgres from "postgres";
import fs from "fs";

const v = {};
for (const l of fs.readFileSync(".env.backup", "utf8").split("\n")) {
  const t = l.trim();
  if (!t || t.startsWith("#")) continue;
  const i = t.indexOf("=");
  v[t.slice(0, i)] = t.slice(i + 1).trim();
}

const sql = postgres(v.TARGET_DB_URL, { max: 1, prepare: false });
const rows = await sql`
  select c.relname, c.relacl
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname in ('company_users','profiles','user_roles','companies','company_modules')
  order by c.relname
`;
for (const r of rows) console.log(r.relname, r.relacl);
await sql.end();
