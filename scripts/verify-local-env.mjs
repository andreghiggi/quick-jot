import fs from "node:fs";

function load(path) {
  const env = {};
  if (!fs.existsSync(path)) return env;
  for (const line of fs.readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    let val = t.slice(i + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[t.slice(0, i).trim()] = val;
  }
  return env;
}

// Mesma ordem do Vite: .env.local sobrescreve .env
const merged = { ...load(".env"), ...load(".env.local") };
const url = merged.VITE_SUPABASE_URL || "(ausente)";
const project = merged.VITE_SUPABASE_PROJECT_ID || "(ausente)";
const key = merged.VITE_SUPABASE_PUBLISHABLE_KEY || "(ausente)";

console.log("=== Env efetivo (como o Vite carrega) ===");
console.log("VITE_SUPABASE_URL:", url);
console.log("VITE_SUPABASE_PROJECT_ID:", project);
console.log("VITE_SUPABASE_PUBLISHABLE_KEY:", key.slice(0, 30) + "...");

const esperado = "vyotbtmnnosiejyltlxc";
if (project !== esperado) {
  console.error("\n❌ Projeto errado! Esperado:", esperado);
  console.error("   Reinicie o dev server: Ctrl+C → npm run dev");
  process.exit(1);
}

console.log("\n✅ Apontando para o espelho externo correto.");
console.log("   Se o login ainda falhar, reinicie o npm run dev (Vite só lê .env na subida).");
