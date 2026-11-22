export type EvolutionRequest = (path: string, method?: string, body?: unknown, timeoutMs?: number) => Promise<any>;
export function evolutionRequest(baseUrl: string, apiKey: string): EvolutionRequest {
  return async (path, method = 'GET', body, timeoutMs = 5000) => {
    const response = await fetch(`${baseUrl.replace(/\/$/, '')}${path}`, {
      method, headers: { apikey: apiKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || data?.error === true) throw new Error(`Evolution HTTP ${response.status}`);
    return data;
  };
}
export async function restoreConfiguration(call: EvolutionRequest, name: string, webhookUrl: string) {
  const events = ['MESSAGES_UPSERT', 'CONNECTION_UPDATE'];
  await call(`/webhook/set/${name}`, 'POST', {
    webhook: { enabled: true, url: webhookUrl, byEvents: false, base64: false, events },
    url: webhookUrl, enabled: true, webhook_by_events: false, webhook_base64: false, events,
  });
  const settings = await call(`/settings/find/${name}`);
  if (!settings || typeof settings !== 'object') throw new Error('Settings unavailable');
  if (settings.alwaysOnline !== false) {
    await call(`/settings/set/${name}`, 'POST', { ...settings, alwaysOnline: false });
  }
}
export async function restartAndVerify(call: EvolutionRequest, name: string,
  sleep: (ms: number) => Promise<void> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now: () => number = Date.now) {
  // v2.3.x uses POST; older v2 versions use PUT. Retry only explicit route/method rejection.
  try { await call(`/instance/restart/${name}`, 'POST'); }
  catch (error) {
    if (!(error instanceof Error) || !/^Evolution HTTP (404|405)$/.test(error.message)) throw error;
    await call(`/instance/restart/${name}`, 'PUT');
  }
  const deadline = now() + 10000;
  while (now() < deadline) {
    const remaining = deadline - now();
    try {
      const result = await call(`/instance/connectionState/${name}`, 'GET', undefined, Math.min(1500, remaining));
      if (result?.instance?.state === 'open') return true;
    } catch { /* transient polling errors are not proof of logout */ }
    const wait = Math.min(1000, deadline - now());
    if (wait > 0) await sleep(wait);
  }
  return false;
}
export async function recoverInstance(db: any, call: EvolutionRequest, name: string, companyId: string,
  webhookUrl: string, manual = false) {
  // Recheck the provider even for a close webhook: that event may be delayed.
  // Unknown/unavailable/connecting state must fail safe without claiming a restart.
  if (!manual) {
    const state = await call(`/instance/connectionState/${name}`);
    if (state?.instance?.state !== 'close') return {
      success: false, skipped: true, error: 'Reinício automático permitido somente para conexão confirmada como desconectada.',
    };
  }
  const { data: token, error } = await db.rpc('whatsapp_claim_restart', {
    _name: name, _company: companyId, _manual: manual,
  });
  if (error) throw new Error('Recovery storage unavailable');
  if (!token) return { success: false, skipped: true, error: 'Recuperação bloqueada ou outra conexão está sendo recuperada. Aguarde um minuto e atualize.' };
  let open = false;
  let configured = false;
  let detail = 'A conexão não voltou em 10 segundos; verificar a sessão/QR. Duas falhas bloqueiam novas tentativas automáticas.';
  try {
    // The lease claim may race with a natural reconnect. Never restart it if it reopened.
    const state = manual ? null : await call(`/instance/connectionState/${name}`);
    if (!manual && state?.instance?.state === 'open') {
      open = true;
    } else {
      if (!manual && state?.instance?.state !== 'close') throw new Error('Connection no longer confirmed closed');
      open = await restartAndVerify(call, name);
    }
    if (open) {
      await restoreConfiguration(call, name, webhookUrl);
      configured = true;
      detail = 'Sessão conectada e ajustes aplicados; aguarda mensagem real para confirmar recebimento.';
    }
  } catch {
    detail = 'Falha ao reiniciar ou reconfigurar a conexão; verificar sessão/QR. Novas tentativas automáticas são limitadas.';
  } finally {
    const { error: finishError } = await db.rpc('whatsapp_finish_restart', {
      _name: name, _token: token, _open: open && configured, _detail: detail,
    });
    if (finishError) throw new Error('Recovery result could not be persisted');
    const { error: statusError } = await db.from('whatsapp_instances').update({ status: open ? 'connected' : 'disconnected' })
      .eq('instance_name', name).eq('company_id', companyId);
    if (statusError) throw new Error('Connection status could not be persisted');
  }
  return { success: open && configured, state: open ? 'open' : 'close', error: open && configured ? undefined : detail };
}
