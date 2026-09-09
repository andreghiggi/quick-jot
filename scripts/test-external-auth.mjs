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

const env = loadEnvLocal();
const url = env.VITE_SUPABASE_URL;
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY;

console.log("Supabase:", url);

const sb = createClient(url, key);

const health = await fetch(`${url}/auth/v1/health`, {
  headers: { apikey: key },
});
console.log("auth_health:", health.status);

const bad = await sb.auth.signInWithPassword({
  email: "nao-existe-xyz@comandatech.app",
  password: "123456789",
});
console.log("login_usuario_inexistente:", bad.error?.message ?? "ok (inesperado)");

// Contagem indireta: profiles públicos (RLS pode bloquear)
const { count, error: profilesErr } = await sb
  .from("profiles")
  .select("*", { count: "exact", head: true });
console.log("profiles_count:", profilesErr?.message ?? count);

const { count: companiesCount, error: companiesErr } = await sb
  .from("companies")
  .select("*", { count: "exact", head: true });
console.log("companies_count:", companiesErr?.message ?? companiesCount);
