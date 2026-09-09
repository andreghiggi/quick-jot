import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";

function loadEnvLocal() {
  const env = {};
  for (const line of fs.readFileSync(".env.local", "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
  }
  return env;
}

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error("Uso: node scripts/test-login-flow.mjs <email> <senha>");
  process.exit(1);
}

const env = loadEnvLocal();
const sb = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY);

const signIn = await sb.auth.signInWithPassword({ email, password });
if (signIn.error) {
  console.error("login_erro:", signIn.error.message);
  process.exit(1);
}

const userId = signIn.data.user.id;
console.log("login_ok user_id:", userId);

const profile = await sb.from("profiles").select("*").eq("id", userId).single();
console.log("profile:", profile.error?.message ?? profile.data);

const roles = await sb.from("user_roles").select("role").eq("user_id", userId);
console.log("roles:", roles.error?.message ?? roles.data?.map((r) => r.role));

const cu = await sb.from("company_users").select("company_id").eq("user_id", userId);
console.log("company_users:", cu.error?.message ?? cu.data);

if (cu.data?.[0]?.company_id) {
  const company = await sb.from("companies").select("id,name,slug,active").eq("id", cu.data[0].company_id).single();
  console.log("company:", company.error?.message ?? company.data);
}

await sb.auth.signOut();
