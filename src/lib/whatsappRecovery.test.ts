import { describe, it, expect, vi } from 'vitest';
import { extractMessageText, isGreeting, isLoggedOut, isStaleMessage, resolveSenderPhone, REPLY_COOLDOWN_MS } from '../../supabase/functions/_shared/whatsapp-message';
import { restartAndVerify, recoverInstance, restoreConfiguration, type EvolutionRequest } from '../../supabase/functions/_shared/whatsapp-recovery';

const name = 'ct-fixture';
const company = '00000000-0000-0000-0000-000000000001';
const webhook = 'https://example.invalid/functions/v1/whatsapp-webhook';

function clock() {
  let time = 0;
  return { now: () => time, sleep: async (ms: number) => { time += ms; } };
}
function database(token: string | null = 'lease-1') {
  const eq = vi.fn();
  const update = vi.fn(() => ({ eq }));
  eq.mockImplementation(() => ({ eq, then: (resolve: (value: unknown) => unknown) => resolve({ error: null }) }));
  const rpc = vi.fn(async (fn: string) => ({ data: fn === 'whatsapp_claim_restart' ? token : null, error: null }));
  return { rpc, from: vi.fn(() => ({ update })), update, eq };
}

describe('WhatsApp approved greeting rules', () => {
  it('sets repetition cooldown to exactly 2 hours', () => expect(REPLY_COOLDOWN_MS).toBe(7200000));
  it('keeps the 4-hour age boundary inclusive in seconds and milliseconds', () => {
    const now = 1800000000000;
    expect(isStaleMessage(now - 14400000, now)).toBe(false);
    expect(isStaleMessage(now - 14400001, now)).toBe(true);
    expect(isStaleMessage((now - 14400000) / 1000, now)).toBe(false);
    expect(isStaleMessage((now - 14401000) / 1000, now)).toBe(true);
  });
  it.each(['oi', 'oiiii', 'oieee', 'olá', 'ola', 'olááá', 'alô', 'alo', 'cardápio', 'cardapio', 'catálogo', 'catalogo', 'boa noite', 'bom dia'])('keeps existing accent/repeated-letter activation for %s', text => expect(isGreeting(text)).toBe(true));
  it.each(['link', 'menu', 'já paguei', 'obrigado'])('does not add discarded standalone activation %s', text => expect(isGreeting(text)).toBe(false));
  it('unwraps ephemeral extended text', () => expect(extractMessageText({ ephemeralMessage: { message: { extendedTextMessage: { text: 'Oiiii' } } } })).toBe('Oiiii'));
  it.each(['imageMessage', 'documentMessage', 'videoMessage'])('extracts %s captions', field => expect(extractMessageText({ [field]: { caption: 'Olá' } })).toBe('Olá'));
  it('unwraps document-with-caption inside temporary message', () => {
    expect(extractMessageText({ ephemeralMessage: { message: { documentWithCaptionMessage: { message: { documentMessage: { caption: 'cardápio' } } } } } })).toBe('cardápio');
  });
  it('bounded extraction terminates cyclic payloads', () => {
    const cyclic: any = {}; cyclic.ephemeralMessage = { message: cyclic };
    expect(extractMessageText(cyclic)).toBe('');
  });
  it('only explicit session logout reason 401/ loggedOut requires QR', () => {
    expect(isLoggedOut({ statusReason: 401 })).toBe(true);
    expect(isLoggedOut({ disconnectionReason: 'loggedOut' })).toBe(true);
    expect(isLoggedOut({ statusReason: 408 })).toBe(false);
    expect(isLoggedOut({ status: 401 })).toBe(false);
  });
});

describe('soft restart verification', () => {
  it('reconnects using restart only, not logout, deletion or sending messages', async () => {
    const call = vi.fn(async (path: string) => path.includes('connectionState') ? { instance: { state: 'open' } } : {});
    const c = clock();
    expect(await restartAndVerify(call, name, c.sleep, c.now)).toBe(true);
    expect(call.mock.calls.map(args => args[0])).toEqual([`/instance/restart/${name}`, `/instance/connectionState/${name}`]);
  });
  it('does not call a connected session a successful restart when restart failed', async () => {
    const call = vi.fn(async () => { throw new Error('Evolution HTTP 500'); });
    await expect(restartAndVerify(call, name)).rejects.toThrow('500');
    expect(call).toHaveBeenCalledTimes(1);
  });
  it('supports the old PUT route only after explicit POST method rejection', async () => {
    const call = vi.fn(async (path: string, method?: string) => {
      if (path.includes('restart') && method === 'POST') throw new Error('Evolution HTTP 405');
      return path.includes('connectionState') ? { instance: { state: 'open' } } : {};
    });
    const c = clock();
    expect(await restartAndVerify(call, name, c.sleep, c.now)).toBe(true);
    expect(call).toHaveBeenNthCalledWith(2, `/instance/restart/${name}`, 'PUT');
  });
  it('stops polling after 10 seconds and reports failure, not proof of corruption', async () => {
    const c = clock();
    const call: EvolutionRequest = async () => ({ instance: { state: 'connecting' } });
    expect(await restartAndVerify(call, name, c.sleep, c.now)).toBe(false);
    expect(c.now()).toBe(10000);
  });
});

describe('persisted recovery orchestration', () => {
  it('a refused claim only reads connection state and never restarts', async () => {
    const db = database(null); const call = vi.fn(async () => ({ instance: { state: 'close' } }));
    const result = await recoverInstance(db, call, name, company, webhook);
    expect(result.skipped).toBe(true); expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(`/instance/connectionState/${name}`);
    expect(db.rpc).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith('whatsapp_claim_restart', { _name: name, _company: company, _manual: false });
  });
  it('passes the exact tenant and persists a verified result under its lease', async () => {
    const db = database();
    const call = vi.fn(async (path: string) => path.includes('connectionState') ? { instance: { state: 'open' } } : path.includes('settings/find') ? { alwaysOnline: false } : {});
    const result = await recoverInstance(db, call, name, company, webhook, true);
    expect(result.success).toBe(true);
    expect(db.rpc).toHaveBeenNthCalledWith(1, 'whatsapp_claim_restart', { _name: name, _company: company, _manual: true });
    expect(db.rpc).toHaveBeenLastCalledWith('whatsapp_finish_restart', expect.objectContaining({ _name: name, _token: 'lease-1', _open: true }));
    expect(db.eq).toHaveBeenCalledWith('company_id', company);
  });
  it('configuration rejection is persisted as failure even if state is open', async () => {
    const db = database();
    const call = vi.fn(async (path: string) => {
      if (path.includes('webhook/set')) throw new Error('Evolution HTTP 503');
      return { instance: { state: 'open' } };
    });
    expect((await recoverInstance(db, call, name, company, webhook, true)).success).toBe(false);
    expect(db.rpc).toHaveBeenLastCalledWith('whatsapp_finish_restart', expect.objectContaining({ _open: false }));
  });
  it('provider failure releases/persists the lease as unsuccessful', async () => {
    const db = database(); const call = vi.fn(async () => { throw new Error('Evolution HTTP 500'); });
    expect((await recoverInstance(db, call, name, company, webhook, true)).success).toBe(false);
    expect(db.rpc).toHaveBeenLastCalledWith('whatsapp_finish_restart', expect.objectContaining({ _token: 'lease-1', _open: false }));
  });
  it('does not report success if persisting the result fails', async () => {
    const db = database(); db.rpc.mockImplementation(async (fn: string) => ({ data: fn === 'whatsapp_claim_restart' ? 'lease-1' : null, error: fn === 'whatsapp_finish_restart' ? { message: 'unavailable' } as any : null }));
    const call: EvolutionRequest = async path => path.includes('settings/find') ? { alwaysOnline: false } : { instance: { state: 'open' } };
    await expect(recoverInstance(db, call, name, company, webhook, true)).rejects.toThrow('persisted');
  });
  it('preserves existing settings when disabling forced online presence', async () => {
    const call = vi.fn(async (path: string) => path.includes('settings/find') ? { alwaysOnline: true, rejectCall: true, readMessages: false, groupsIgnore: true } : {});
    await restoreConfiguration(call, name, webhook);
    expect(call).toHaveBeenLastCalledWith(`/settings/set/${name}`, 'POST', { alwaysOnline: false, rejectCall: true, readMessages: false, groupsIgnore: true });
  });
});

describe('automatic restart safety', () => {
  it.each(['open', 'connecting', undefined])('does not claim or restart for provider state %s even after a delayed close event', async state => {
    const db = database();
    const call = vi.fn(async () => ({ instance: { state } }));
    expect((await recoverInstance(db, call, name, company, webhook)).skipped).toBe(true);
    expect(db.rpc).not.toHaveBeenCalled();
    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith(`/instance/connectionState/${name}`);
  });
  it('does not claim or restart when connection verification is unavailable', async () => {
    const db = database(); const call = vi.fn(async () => { throw new Error('Unavailable'); });
    await expect(recoverInstance(db, call, name, company, webhook)).rejects.toThrow('Unavailable');
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it('preserves a session that reopens while the lease is claimed', async () => {
    const db = database(); let reads = 0;
    const call = vi.fn(async (path: string) => path.includes('connectionState')
      ? { instance: { state: ++reads === 1 ? 'close' : 'open' } } : { alwaysOnline: false });
    expect((await recoverInstance(db, call, name, company, webhook)).success).toBe(true);
    expect(call.mock.calls.some(([path]) => path.includes('/restart/'))).toBe(false);
    expect(db.rpc).toHaveBeenLastCalledWith('whatsapp_finish_restart', expect.objectContaining({ _open: true }));
  });
  it('still restarts a confirmed closed session under its tenant lease', async () => {
    const db = database(); let reads = 0;
    const call = vi.fn(async (path: string) => path.includes('connectionState')
      ? { instance: { state: ++reads <= 2 ? 'close' : 'open' } } : { alwaysOnline: false });
    expect((await recoverInstance(db, call, name, company, webhook)).success).toBe(true);
    expect(call).toHaveBeenCalledWith(`/instance/restart/${name}`, 'POST');
    expect(db.rpc).toHaveBeenCalledWith('whatsapp_claim_restart', { _name: name, _company: company, _manual: false });
  });
});

describe('privacy sender identity', () => {
  it('uses remoteJidAlt as the phone for a LID', () => {
    expect(resolveSenderPhone({ remoteJid: '147656781332487@lid', remoteJidAlt: '555197170371@s.whatsapp.net' })).toBe('555197170371');
  });
  it('preserves regular phone JIDs even when the alternate identity is a LID', () => {
    expect(resolveSenderPhone({ remoteJid: '555197170371@s.whatsapp.net', remoteJidAlt: '147656781332487@lid' })).toBe('555197170371');
  });
  it.each([undefined, '147656781332487@lid', '555197170371', 'invalid@s.whatsapp.net'])('never treats LID or invalid alternate %s as a phone', remoteJidAlt => {
    expect(resolveSenderPhone({ remoteJid: '147656781332487@lid', remoteJidAlt })).toBe('');
  });
  it.each(['123@g.us', 'status@broadcast', '123@newsletter'])('does not resolve non-private destination %s through its alternate', remoteJid => {
    expect(resolveSenderPhone({ remoteJid, remoteJidAlt: '555197170371@s.whatsapp.net' })).toBe('');
  });
});

describe('saudações curtas', () => {
  it('reconhece noite, tarde e dia isolados', () => {
    expect(isGreeting('Noite')).toBe(true);
    expect(isGreeting('tarde')).toBe(true);
    expect(isGreeting('Dia!')).toBe(true);
    expect(isGreeting('Oii boa noite')).toBe(true);
  });
  it('não dispara em frases comuns', () => {
    expect(isGreeting('2x frango')).toBe(false);
    expect(isGreeting('diamante')).toBe(false);
  });
});
