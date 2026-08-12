import postgres from "npm:postgres@3.4.4";

export async function mirrorAuth(source: postgres.Sql, target: postgres.Sql, notify: (text: string) => Promise<void>) {
  const results = {
    users: 0,
    identities: 0,
    errors: [] as string[]
  };

  try {
    const srcUserCols = await source`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users'
      AND column_name NOT IN ('sessions', 'refresh_tokens', 'flow_state', 'confirmed_at')
    `;
    const tgtUserCols = await target`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'users'
      AND column_name NOT IN ('sessions', 'refresh_tokens', 'flow_state', 'confirmed_at')
    `;
    
    const commonUserCols = srcUserCols
      .map(c => c.column_name as string)
      .filter(name => tgtUserCols.some(tc => tc.column_name === name));

    const srcIdentCols = await source`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'identities'
      AND column_name NOT IN ('email', 'identity_data')
    `;
    const tgtIdentCols = await target`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'auth' AND table_name = 'identities'
      AND column_name NOT IN ('email', 'identity_data')
    `;

    const commonIdentCols = srcIdentCols
      .map(c => c.column_name as string)
      .filter(name => tgtIdentCols.some(tc => tc.column_name === name));

    await target`SET session_replication_role = 'replica'`;
    await target`DELETE FROM auth.identities`;
    await target`DELETE FROM auth.users`;

    const users = await source.unsafe(`SELECT ${commonUserCols.map(c => `"${c}"`).join(",")} FROM auth.users`);
    if (users.length > 0) {
      const colNames = commonUserCols.map(c => `"${c}"`).join(",");
      for (const user of users) {
        try {
          const placeholders = commonUserCols.map((_, i) => `$${i + 1}`).join(",");
          const values = commonUserCols.map(c => user[c]);
          await target.unsafe(`INSERT INTO auth.users (${colNames}) VALUES (${placeholders})`, values);
          results.users++;
        } catch (err) {
          results.errors.push(`User ${user.id} error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    const identities = await source.unsafe(`SELECT ${commonIdentCols.map(c => `"${c}"`).join(",")}, identity_data FROM auth.identities`);
    if (identities.length > 0) {
      const hasIdentityDataInTarget = (await target`
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'identity_data'
      `).length > 0;

      for (const id of identities) {
        try {
          const finalCols = [...commonIdentCols];
          const finalValues = commonIdentCols.map(c => id[c]);
          
          if (hasIdentityDataInTarget) {
            finalCols.push('identity_data');
            let data = id.identity_data;
            
            // Critical fix: Ensure identity_data is never null or undefined
            // and is provided as a valid JSON object or string
            if (data === null || data === undefined || data === "") {
              data = JSON.stringify({ sub: id.user_id });
            } else if (typeof data === 'object') {
              data = JSON.stringify(data);
            }
            
            finalValues.push({ sub: id.user_id });
          } else if (hasIdentityDataInTarget && commonIdentCols.includes('identity_data')) {
            const dataIdx = finalCols.indexOf('identity_data');
            // SE O VALOR É NULO, FORÇAMOS UM OBJETO VÁLIDO
            if (finalValues[dataIdx] === null || finalValues[dataIdx] === undefined || finalValues[dataIdx] === "") {
              finalValues[dataIdx] = { sub: id.user_id };
            }
          }

          const placeholders = finalCols.map((_, i) => `$${i + 1}`).join(",");
          const colNamesStr = finalCols.map(c => `"${c}"`).join(",");
          await target.unsafe(`INSERT INTO auth.identities (${colNamesStr}) VALUES (${placeholders})`, finalValues);
          results.identities++;
        } catch (err) {
          results.errors.push(`Identity ${id.id} error: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
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