import postgres from "postgres";

const pwd = encodeURIComponent("K7m2y9u4@123");
const ref = "iwmrtxdzlkasuzutxvhh";
const hosts = [
  `postgresql://postgres.${ref}:${pwd}@aws-0-us-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${pwd}@aws-0-us-west-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${pwd}@aws-1-us-west-2.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres.${ref}:${pwd}@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`,
  `postgresql://postgres:${pwd}@db.${ref}.supabase.co:5432/postgres`,
];

for (const url of hosts) {
  const host = url.match(/@([^/]+)/)?.[1] ?? url;
  const sql = postgres(url, { max: 1, prepare: false, connect_timeout: 8 });
  try {
    await sql`select 1 as ok`;
    const u = await sql`select count(*)::int as n from auth.users`;
    console.log("OK", host, "auth.users=", u[0].n);
  } catch (e) {
    console.log("FAIL", host, e.message?.slice(0, 80));
  } finally {
    await sql.end({ timeout: 2 }).catch(() => {});
  }
}
