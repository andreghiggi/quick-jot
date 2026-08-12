import postgres from "npm:postgres@3.4.4";

export async function mirrorAuth(source: postgres.Sql, target: postgres.Sql, notify: (text: string) => Promise<void>) {
  const results = {
    users: 0,
    identities: 0,
    errors: [] as string[]
  };

  try {
    // 1. Get common columns for auth.users
    const srcUserCols = await source`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users'
      AND column_name NOT IN ('sessions', 'refresh_tokens', 'flow_state')
    `;
    const tgtUserCols = await target`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users'
      AND column_name NOT IN ('sessions', 'refresh_tokens', 'flow_state')
    `;
    
    const commonUserCols = srcUserCols
      .map(c => c.column_name as string)
      .filter(name => tgtUserCols.some(tc => tc.column_name === name));

    // 2. Get common columns for auth.identities
    const srcIdentCols = await source`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'identities'
    `;
    const tgtIdentCols = await target`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'identities'
    `;

    const commonIdentCols = srcIdentCols
      .map(c => c.column_name as string)
      .filter(name => tgtIdentCols.some(tc => tc.column_name === name));

    // 3. CLEAN DESTINATION (Order: identities -> users)
    await target`SET session_replication_role = 'replica'`;
    await target`DELETE FROM auth.identities`;
    await target`DELETE FROM auth.users`;

    // 4. COPY USERS
    const users = await source.unsafe(`SELECT ${commonUserCols.map(c => `"${c}"`).join(",")} FROM auth.users`);
    if (users.length > 0) {
      // Manual batch insert for auth schema (avoids postgres-js helper ambiguity in internal schemas)
      const colNames = commonUserCols.map(c => `"${c}"`).join(",");
      const placeholders = users.map((_, i) => 
        `(${commonUserCols.map((_, j) => `$${i * commonUserCols.length + j + 1}`).join(",")})`
      ).join(",");
      const values = users.flatMap(u => commonUserCols.map(c => u[c]));
      
      await target.unsafe(`INSERT INTO auth.users (${colNames}) VALUES ${placeholders}`, values);
      results.users = users.length;
    }

    // 5. COPY IDENTITIES
    const identities = await source.unsafe(`SELECT ${commonIdentCols.map(c => `"${c}"`).join(",")} FROM auth.identities`);
    if (identities.length > 0) {
      const colNames = commonIdentCols.map(c => `"${c}"`).join(",");
      const placeholders = identities.map((_, i) => 
        `(${commonIdentCols.map((_, j) => `$${i * commonIdentCols.length + j + 1}`).join(",")})`
      ).join(",");
      const values = identities.flatMap(id => commonIdentCols.map(c => id[c]));
      
      await target.unsafe(`INSERT INTO auth.identities (${colNames}) VALUES ${placeholders}`, values);
      results.identities = identities.length;
    }

    const nowBrt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const text = `🔐 *Backup Auth Concluído*\n` +
      `Data: ${nowBrt}\n` +
      `Usuários: ${results.users}\n` +
      `Identidades: ${results.identities}`;
    await notify(text);

  } catch (e) {
    results.errors.push(e instanceof Error ? e.message : String(e));
  }

  return results;
}
